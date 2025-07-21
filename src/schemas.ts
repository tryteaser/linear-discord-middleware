import { z } from "zod";

// Schema for a Linear User
const LinearUserSchema = z
	.object({
		name: z.string(),
	})
	.optional();

// Schema for a Linear Team
const LinearTeamSchema = z
	.object({
		name: z.string(),
	})
	.optional();

// Schema for a Linear State
const LinearStateSchema = z
	.object({
		name: z.string(),
	})
	.optional();

// Schema for a Linear Priority
const LinearPrioritySchema = z
	.object({
		name: z.string(),
	})
	.optional();

// Schema for a Linear Issue
export const LinearIssueSchema = z.object({
	id: z.string(),
	title: z.string(),
	description: z.string().optional().nullable(),
	url: z.url(),
	state: LinearStateSchema,
	assignee: LinearUserSchema,
	creator: LinearUserSchema,
	updater: LinearUserSchema,
	team: LinearTeamSchema,
	priority: LinearPrioritySchema,
});

// Schema for the overall Linear Webhook Payload
export const LinearWebhookPayloadSchema = z.object({
	action: z.enum(["create", "update", "remove"]),
	type: z.literal("Issue"),
	data: LinearIssueSchema,
	updatedFrom: LinearIssueSchema.partial().optional(),
	webhookTimestamp: z.number(),
});

// Infer TypeScript types from schemas
export type LinearIssue = z.infer<typeof LinearIssueSchema>;
export type LinearWebhookPayload = z.infer<typeof LinearWebhookPayloadSchema>;
