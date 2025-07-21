// Load environment variables from .env file

import crypto from "node:crypto";
import axios, { type AxiosError } from "axios";
import bodyParser from "body-parser";
import dotenv from "dotenv";
import express, { type Request, type Response } from "express";
import z from "zod";

// Initialize environment variables
dotenv.config();

import { type LinearIssue, LinearWebhookPayloadSchema } from "./schemas.js";

interface DiscordEmbed {
	title: string;
	url?: string;
	description: string;
	color: number;
	fields?: Array<{
		name: string;
		value: string;
		inline?: boolean;
	}>;
	footer?: {
		text: string;
		icon_url?: string;
	};
	timestamp?: string;
}

interface DiscordWebhookPayload {
	username?: string;
	avatar_url?: string;
	content: string;
	embeds: DiscordEmbed[];
}

// Initialize Express app
const app = express();
const PORT = process.env.PORT || 3000;
const DISCORD_WEBHOOK_URL = process.env.DISCORD_WEBHOOK_URL;
const LINEAR_WEBHOOK_SECRET = process.env.LINEAR_WEBHOOK_SECRET || "";

// Validate required environment variables
if (!DISCORD_WEBHOOK_URL) {
	console.error("DISCORD_WEBHOOK_URL is not set in environment variables.");
	process.exit(1);
}

// Middleware for raw body parsing (for webhook signature verification)
app.use("/linear-webhook", bodyParser.raw({ type: "application/json" }));
// Use JSON parser for all other routes
app.use(bodyParser.json());

// --- Request Logger Middleware ---
app.use((req: Request, _res: Response, next) => {
	console.log(
		`[${new Date().toISOString()}] Received ${req.method} request for ${req.url}`,
	);
	next();
});

// --- Helper Functions for Discord Embeds ---

/**
 * Generates a Discord embed for a new Linear issue.
 */
function createIssueEmbed(issueData: LinearIssue): DiscordEmbed {
	const {
		id,
		title,
		description,
		url,
		state,
		assignee,
		creator,
		team,
		priority,
	} = issueData;

	// Default values if properties are missing
	const assigneeName = assignee ? assignee.name : "Unassigned";
	const creatorName = creator ? creator.name : "Unknown";
	const teamName = team ? team.name : "Unknown Team";
	const stateName = state ? state.name : "No Status";
	const priorityName = priority ? priority.name : "No Priority";

	return {
		title: `Issue Created: ${title} (${id})`,
		url: url,
		description: description || "No description provided.",
		color: 3066993, // Green color for creation
		fields: [
			{ name: "Team", value: teamName, inline: true },
			{ name: "Status", value: stateName, inline: true },
			{ name: "Priority", value: priorityName, inline: true },
			{ name: "Assignee", value: assigneeName, inline: true },
			{ name: "Created By", value: creatorName, inline: true },
		],
		footer: {
			text: "Linear Issue Tracker",
			icon_url: "https://linear.app/static/linear-logo.png",
		},
		timestamp: new Date().toISOString(),
	};
}

/**
 * Generates a Discord embed for an updated Linear issue.
 */
function updateIssueEmbed(
	issueData: LinearIssue,
	updatedFrom: Partial<LinearIssue> = {},
): DiscordEmbed {
	const { id, title, url, state, assignee, team, priority } = issueData;

	const changes: string[] = [];
	const color = 16776960; // Yellow for updates

	// Check for status change
	if (updatedFrom.state && state && updatedFrom.state.name !== state.name) {
		changes.push(`Status: **${updatedFrom.state.name}** → **${state.name}**`);
	}

	// Check for assignee change
	if (
		updatedFrom.assignee &&
		updatedFrom.assignee.name !== (assignee ? assignee.name : "Unassigned")
	) {
		changes.push(
			`Assignee: **${updatedFrom.assignee.name}** → **${assignee ? assignee.name : "Unassigned"}**`,
		);
	} else if (!updatedFrom.assignee && assignee) {
		changes.push(`Assignee: Unassigned → **${assignee.name}**`);
	} else if (updatedFrom.assignee && !assignee) {
		changes.push(`Assignee: **${updatedFrom.assignee.name}** → Unassigned`);
	}

	// Check for title change
	if (updatedFrom.title && updatedFrom.title !== title) {
		changes.push(`Title: **${updatedFrom.title}** → **${title}**`);
	}

	// Check for priority change
	if (
		updatedFrom.priority &&
		priority &&
		updatedFrom.priority.name !== priority.name
	) {
		changes.push(
			`Priority: **${updatedFrom.priority.name}** → **${priority.name}**`,
		);
	} else if (!updatedFrom.priority && priority) {
		changes.push(`Priority: No Priority → **${priority.name}**`);
	} else if (updatedFrom.priority && !priority) {
		changes.push(`Priority: **${updatedFrom.priority.name}** → No Priority`);
	}

	const descriptionText =
		changes.length > 0 ? changes.join("\n") : "Details updated.";

	return {
		title: `Issue Updated: ${title} (${id})`,
		url: url,
		description: descriptionText,
		color: color,
		fields: [
			{ name: "Team", value: team ? team.name : "Unknown Team", inline: true },
			{
				name: "Current Status",
				value: state ? state.name : "No Status",
				inline: true,
			},
			{
				name: "Current Assignee",
				value: assignee ? assignee.name : "Unassigned",
				inline: true,
			},
		],
		footer: {
			text: "Linear Issue Tracker",
			icon_url: "https://linear.app/static/linear-logo.png",
		},
		timestamp: new Date().toISOString(),
	};
}

/**
 * Generates a Discord embed for a deleted Linear issue.
 */
function deleteIssueEmbed(issueData: LinearIssue): DiscordEmbed {
	const { id, title, team } = issueData;

	return {
		title: `Issue Deleted: ${title} (${id})`,
		description: `The issue **${title}** (\`${id}\`) from team **${team ? team.name : "Unknown Team"}** has been deleted.`,
		color: 15158332, // Red color for deletion
		footer: {
			text: "Linear Issue Tracker",
			icon_url: "https://linear.app/static/linear-logo.png",
		},
		timestamp: new Date().toISOString(),
	};
}

/**
 * Verifies the Linear webhook signature.
 */
function verifySignature(
	signature: string,
	payload: string,
	secret: string,
): boolean {
	if (!secret) {
		console.warn(
			"LINEAR_WEBHOOK_SECRET is not set. Webhook signature verification skipped.",
		);
		return true; // If no secret is set, skip verification (less secure)
	}

	try {
		const [t, s] = signature.split(",").map((part) => part.split("="));
		const _timestamp = parseInt(t[1], 10);
		const expectedSignature = s[1];

		// Calculate HMAC-SHA256 hash of the raw payload
		const hmac = crypto.createHmac("sha256", secret);
		hmac.update(payload);
		const digest = hmac.digest("hex");

		// Compare the calculated signature with the received signature
		// Use crypto.timingSafeEqual to prevent timing attacks
		const signatureBuffer = Buffer.from(expectedSignature);
		const digestBuffer = Buffer.from(digest);

		if (signatureBuffer.length !== digestBuffer.length) {
			return false;
		}

		return crypto.timingSafeEqual(signatureBuffer, digestBuffer);
	} catch (error) {
		console.error("Error verifying signature:", error);
		return false;
	}
}

// --- Webhook Endpoint ---
app.post("/linear-webhook", async (req: Request, res: Response) => {
	try {
		const linearSignature = req.headers["linear-signature"] as string;

		// Since we're using bodyParser.raw for this route, req.body is a Buffer
		const rawBody = req.body.toString();

		// Verify the signature before parsing the payload
		if (
			LINEAR_WEBHOOK_SECRET &&
			!verifySignature(linearSignature, rawBody, LINEAR_WEBHOOK_SECRET)
		) {
			console.error("Invalid Linear webhook signature!");
			return res.status(401).send("Invalid signature");
		}

		// Parse and validate the payload with Zod
		const parsedPayload = LinearWebhookPayloadSchema.safeParse(
			JSON.parse(rawBody),
		);

		if (!parsedPayload.success) {
			console.error(
				"Invalid Linear webhook payload:",
				z.treeifyError(parsedPayload.error),
			);
			return res.status(400).send({
				message: "Invalid webhook payload.",
				errors: z.treeifyError(parsedPayload.error),
			});
		}

		// Extract validated data
		const { action, data, updatedFrom } = parsedPayload.data;

		// We already validate type is 'Issue' in the schema, so no further check is needed here.

		let discordEmbed: DiscordEmbed | null = null;
		let discordMessageContent = "";

		switch (action) {
			case "create":
				discordEmbed = createIssueEmbed(data);
				discordMessageContent = `A new issue has been created by ${data.creator ? data.creator.name : "someone"}.`;
				break;
			case "update":
				discordEmbed = updateIssueEmbed(data, updatedFrom);
				discordMessageContent = `Issue **${data.title}** has been updated by ${data.updater ? data.updater.name : "someone"}.`;
				break;
			case "remove": // Linear uses 'remove' for deletion
				discordEmbed = deleteIssueEmbed(data);
				discordMessageContent = `Issue **${data.title}** has been deleted by ${data.updater ? data.updater.name : "someone"}.`;
				break;
			default:
				console.log(`Unhandled Linear action: ${action}`);
				return res.status(200).send(`Unhandled action: ${action}`);
		}

		if (discordEmbed && DISCORD_WEBHOOK_URL) {
			try {
				const discordPayload: DiscordWebhookPayload = {
					username: "Linear Bot",
					avatar_url: "https://linear.app/static/linear-logo.png",
					content: discordMessageContent,
					embeds: [discordEmbed],
				};

				await axios.post(DISCORD_WEBHOOK_URL, discordPayload);
				console.log(
					`Successfully sent Discord notification for Linear issue ${action}: ${data.id}`,
				);
				res.status(200).send("Webhook processed and Discord notified.");
			} catch (error) {
				const axiosError = error as AxiosError;
				console.error(
					"Error sending message to Discord:",
					axiosError.response ? axiosError.response.data : axiosError.message,
				);
				res.status(500).send("Failed to send Discord notification.");
			}
		} else {
			res.status(200).send("No Discord notification generated for this event.");
		}
	} catch (error) {
		console.error("Error processing webhook:", error);
		res.status(400).send("Invalid webhook payload");
	}
});

// Basic health check endpoint
app.get("/", (_req: Request, res: Response) => {
	res.status(200).send("Linear Discord Middleware is running!");
});

// Start the server
app.listen(PORT, () => {
	console.log(`Linear Discord Middleware listening on port ${PORT}`);
	if (!DISCORD_WEBHOOK_URL) {
		console.warn(
			"WARNING: DISCORD_WEBHOOK_URL is not set. Discord notifications will not work.",
		);
	}
	if (!LINEAR_WEBHOOK_SECRET) {
		console.warn(
			"WARNING: LINEAR_WEBHOOK_SECRET is not set. Webhook signature verification is disabled.",
		);
	}
});
