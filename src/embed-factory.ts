import { type DiscordEmbed } from "./discord-client.js";
import { type LinearIssue, type LinearComment } from "./schemas.js";

/**
 * Factory class for creating Discord embeds for different Linear entity types
 */
export class EmbedFactory {
	/**
	 * Creates embeds for Linear Issues
	 */
	static createIssueEmbed(
		action: "create" | "update" | "remove",
		issueData: LinearIssue,
		url: string,
		updatedFrom?: Partial<LinearIssue>
	): DiscordEmbed {
		switch (action) {
			case "create":
				return this.createIssueCreateEmbed(issueData, url);
			case "update":
				return this.createIssueUpdateEmbed(issueData, url, updatedFrom);
			case "remove":
				return this.createIssueDeleteEmbed(issueData);
			default:
				return this.createGenericEmbed("Issue", action, issueData, url);
		}
	}

	/**
	 * Creates embeds for Linear Comments
	 */
	static createCommentEmbed(
		action: "create" | "update" | "remove",
		commentData: LinearComment,
		url: string
	): DiscordEmbed {
		switch (action) {
			case "create":
				return this.createCommentCreateEmbed(commentData, url);
			case "update":
				return this.createCommentUpdateEmbed(commentData, url);
			case "remove":
				return this.createCommentDeleteEmbed(commentData);
			default:
				return this.createGenericEmbed("Comment", action, commentData, url);
		}
	}

	/**
	 * Creates embeds for other Linear entity types (Project, Team, etc.)
	 */
	static createEntityEmbed(
		type: string,
		action: "create" | "update" | "remove",
		data: any,
		url: string
	): DiscordEmbed {
		switch (type) {
			case "Project":
				return this.createProjectEmbed(action, data, url);
			case "Team":
				return this.createTeamEmbed(action, data, url);
			case "User":
				return this.createUserEmbed(action, data, url);
			case "Cycle":
				return this.createCycleEmbed(action, data, url);
			case "IssueLabel":
				return this.createLabelEmbed(action, data, url);
			default:
				return this.createGenericEmbed(type, action, data, url);
		}
	}

	// --- Issue Embed Creators ---

	private static createIssueCreateEmbed(issueData: LinearIssue, url: string): DiscordEmbed {
		const {
			id,
			title,
			description,
			state,
			assignee,
			creator,
			team,
			priority,
		} = issueData;

		return {
			title: `Issue Created: ${title} (${id})`,
			url: url,
			description: description?.substring(0, 2000) || "No description provided.",
			color: 3066993, // Green
			fields: [
				{ name: "Team", value: team?.name || "Unknown Team", inline: true },
				{ name: "Status", value: state?.name || "No Status", inline: true },
				{ name: "Priority", value: priority?.name || "No Priority", inline: true },
				{ name: "Assignee", value: assignee?.name || "Unassigned", inline: true },
				{ name: "Created By", value: creator?.name || "Unknown", inline: true },
			],
			footer: {
				text: "Linear Issue Tracker",
				icon_url: "https://linear.app/static/linear-logo.png",
			},
			timestamp: new Date().toISOString(),
		};
	}

	private static createIssueUpdateEmbed(
		issueData: LinearIssue,
		url: string,
		updatedFrom: Partial<LinearIssue> = {}
	): DiscordEmbed {
		const { id, title, state, assignee, team, priority } = issueData;
		const changes: string[] = [];

		// Track all possible changes
		if (updatedFrom.state && state && updatedFrom.state.name !== state.name) {
			changes.push(`Status: **${updatedFrom.state.name}** → **${state.name}**`);
		}
		if (updatedFrom.assignee?.name !== assignee?.name) {
			const oldAssignee = updatedFrom.assignee?.name || "Unassigned";
			const newAssignee = assignee?.name || "Unassigned";
			changes.push(`Assignee: **${oldAssignee}** → **${newAssignee}**`);
		}
		if (updatedFrom.title && updatedFrom.title !== title) {
			changes.push(`Title: **${updatedFrom.title}** → **${title}**`);
		}
		if (updatedFrom.priority?.name !== priority?.name) {
			const oldPriority = updatedFrom.priority?.name || "No Priority";
			const newPriority = priority?.name || "No Priority";
			changes.push(`Priority: **${oldPriority}** → **${newPriority}**`);
		}

		return {
			title: `Issue Updated: ${title} (${id})`,
			url: url,
			description: changes.length > 0 ? changes.join("\n") : "Details updated.",
			color: 16776960, // Yellow
			fields: [
				{ name: "Team", value: team?.name || "Unknown Team", inline: true },
				{ name: "Current Status", value: state?.name || "No Status", inline: true },
				{ name: "Current Assignee", value: assignee?.name || "Unassigned", inline: true },
			],
			footer: {
				text: "Linear Issue Tracker",
				icon_url: "https://linear.app/static/linear-logo.png",
			},
			timestamp: new Date().toISOString(),
		};
	}

	private static createIssueDeleteEmbed(issueData: LinearIssue): DiscordEmbed {
		const { id, title, team } = issueData;

		return {
			title: `Issue Deleted: ${title} (${id})`,
			description: `The issue **${title}** (\`${id}\`) from team **${team?.name || "Unknown Team"}** has been deleted.`,
			color: 15158332, // Red
			footer: {
				text: "Linear Issue Tracker",
				icon_url: "https://linear.app/static/linear-logo.png",
			},
			timestamp: new Date().toISOString(),
		};
	}

	// --- Comment Embed Creators ---

	private static createCommentCreateEmbed(commentData: LinearComment, url: string): DiscordEmbed {
		return {
			title: "New Comment",
			url: url,
			description: commentData.body?.substring(0, 2000) || "No content provided.",
			color: 5793266, // Blue
			fields: [
				{ name: "Author", value: commentData.user?.name || "Unknown", inline: true },
				{ name: "Issue", value: commentData.issue?.title || `Issue ${commentData.issueId}`, inline: true },
			],
			footer: {
				text: "Linear Comment",
				icon_url: "https://linear.app/static/linear-logo.png",
			},
			timestamp: new Date().toISOString(),
		};
	}

	private static createCommentUpdateEmbed(commentData: LinearComment, url: string): DiscordEmbed {
		return {
			title: "Comment Updated",
			url: url,
			description: commentData.body?.substring(0, 2000) || "No content provided.",
			color: 16776960, // Yellow
			fields: [
				{ name: "Author", value: commentData.user?.name || "Unknown", inline: true },
				{ name: "Issue", value: commentData.issue?.title || `Issue ${commentData.issueId}`, inline: true },
				{ name: "Edited", value: commentData.edited ? "Yes" : "No", inline: true },
			],
			footer: {
				text: "Linear Comment",
				icon_url: "https://linear.app/static/linear-logo.png",
			},
			timestamp: new Date().toISOString(),
		};
	}

	private static createCommentDeleteEmbed(commentData: LinearComment): DiscordEmbed {
		return {
			title: "Comment Deleted",
			description: `Comment by ${commentData.user?.name || "Unknown"} has been deleted.`,
			color: 15158332, // Red
			footer: {
				text: "Linear Comment",
				icon_url: "https://linear.app/static/linear-logo.png",
			},
			timestamp: new Date().toISOString(),
		};
	}

	// --- Entity-Specific Embed Creators ---

	private static createProjectEmbed(action: string, data: any, url: string): DiscordEmbed {
		const actionColor = this.getActionColor(action);
		const title = `Project ${action.charAt(0).toUpperCase() + action.slice(1)}d`;
		
		return {
			title: `${title}: ${data.name || data.id}`,
			url: url,
			description: data.description?.substring(0, 2000) || `Project was ${action}d in Linear.`,
			color: actionColor,
			fields: [
				{ name: "Name", value: data.name || "Unknown", inline: true },
				{ name: "State", value: data.state || "Unknown", inline: true },
			],
			footer: {
				text: "Linear Project",
				icon_url: "https://linear.app/static/linear-logo.png",
			},
			timestamp: new Date().toISOString(),
		};
	}

	private static createTeamEmbed(action: string, data: any, url: string): DiscordEmbed {
		const actionColor = this.getActionColor(action);
		const title = `Team ${action.charAt(0).toUpperCase() + action.slice(1)}d`;
		
		return {
			title: `${title}: ${data.name || data.key || data.id}`,
			url: url,
			description: data.description?.substring(0, 2000) || `Team was ${action}d in Linear.`,
			color: actionColor,
			fields: [
				{ name: "Name", value: data.name || "Unknown", inline: true },
				{ name: "Key", value: data.key || "Unknown", inline: true },
			],
			footer: {
				text: "Linear Team",
				icon_url: "https://linear.app/static/linear-logo.png",
			},
			timestamp: new Date().toISOString(),
		};
	}

	private static createUserEmbed(action: string, data: any, url: string): DiscordEmbed {
		const actionColor = this.getActionColor(action);
		const title = `User ${action.charAt(0).toUpperCase() + action.slice(1)}d`;
		
		return {
			title: `${title}: ${data.name || data.displayName || data.id}`,
			url: url,
			description: `User was ${action}d in Linear.`,
			color: actionColor,
			fields: [
				{ name: "Name", value: data.name || "Unknown", inline: true },
				{ name: "Display Name", value: data.displayName || "Unknown", inline: true },
				{ name: "Email", value: data.email || "Unknown", inline: true },
			],
			footer: {
				text: "Linear User",
				icon_url: "https://linear.app/static/linear-logo.png",
			},
			timestamp: new Date().toISOString(),
		};
	}

	private static createCycleEmbed(action: string, data: any, url: string): DiscordEmbed {
		const actionColor = this.getActionColor(action);
		const title = `Cycle ${action.charAt(0).toUpperCase() + action.slice(1)}d`;
		
		return {
			title: `${title}: ${data.name || data.id}`,
			url: url,
			description: `Cycle was ${action}d in Linear.`,
			color: actionColor,
			fields: [
				{ name: "Name", value: data.name || "Unknown", inline: true },
				{ name: "Number", value: data.number?.toString() || "Unknown", inline: true },
				{ name: "Starts At", value: data.startsAt ? new Date(data.startsAt).toLocaleDateString() : "Unknown", inline: true },
				{ name: "Ends At", value: data.endsAt ? new Date(data.endsAt).toLocaleDateString() : "Unknown", inline: true },
			],
			footer: {
				text: "Linear Cycle",
				icon_url: "https://linear.app/static/linear-logo.png",
			},
			timestamp: new Date().toISOString(),
		};
	}

	private static createLabelEmbed(action: string, data: any, url: string): DiscordEmbed {
		const actionColor = this.getActionColor(action);
		const title = `Label ${action.charAt(0).toUpperCase() + action.slice(1)}d`;
		
		return {
			title: `${title}: ${data.name || data.id}`,
			url: url,
			description: data.description?.substring(0, 2000) || `Label was ${action}d in Linear.`,
			color: actionColor,
			fields: [
				{ name: "Name", value: data.name || "Unknown", inline: true },
				{ name: "Color", value: data.color || "Unknown", inline: true },
			],
			footer: {
				text: "Linear Label",
				icon_url: "https://linear.app/static/linear-logo.png",
			},
			timestamp: new Date().toISOString(),
		};
	}

	// --- Generic Fallback ---

	private static createGenericEmbed(type: string, action: string, data: any, url: string): DiscordEmbed {
		const actionColor = this.getActionColor(action);
		const title = `${type} ${action.charAt(0).toUpperCase() + action.slice(1)}d`;
		const name = data.name || data.title || `${type} ${data.id}`;
		
		return {
			title: title,
			url: url,
			description: data.description?.substring(0, 2000) || `${type} was ${action}d in Linear.`,
			color: actionColor,
			fields: [
				{ name: "Name", value: name, inline: true },
				{ name: "Type", value: type, inline: true },
			],
			footer: {
				text: `Linear ${type}`,
				icon_url: "https://linear.app/static/linear-logo.png",
			},
			timestamp: new Date().toISOString(),
		};
	}

	// --- Helper Methods ---

	/**
	 * Gets Discord embed color based on action type
	 */
	private static getActionColor(action: string): number {
		switch (action) {
			case "create": return 3066993; // Green
			case "update": return 16776960; // Yellow
			case "remove": return 15158332; // Red
			default: return 9807270; // Gray
		}
	}

	/**
	 * Constructs fallback URLs for different Linear entity types
	 */
	static constructFallbackUrl(type: string, data: any): string {
		const baseUrl = "https://linear.app";
		
		switch (type) {
			case "Issue":
				return `${baseUrl}/issue/${data.identifier || data.id || "unknown"}`;
			case "Comment":
				return data.issue?.url || `${baseUrl}/issue/${data.issueId || "unknown"}`;
			case "Project":
				return `${baseUrl}/project/${data.id || "unknown"}`;
			case "Team":
				return `${baseUrl}/team/${data.key || data.id || "unknown"}`;
			case "Cycle":
				return `${baseUrl}/cycle/${data.id || "unknown"}`;
			default:
				return `${baseUrl}/${type.toLowerCase()}/${data.id || "unknown"}`;
		}
	}

	/**
	 * Generates content message for Discord webhook
	 */
	static generateContentMessage(type: string, action: string, data: any): string {
		switch (type) {
			case "Issue":
				const issueCreator = data.creator?.name || data.updater?.name || "someone";
				switch (action) {
					case "create":
						return `A new issue has been created by ${issueCreator}.`;
					case "update":
						return `Issue **${data.title}** has been updated by ${issueCreator}.`;
					case "remove":
						return `Issue **${data.title}** has been deleted by ${issueCreator}.`;
				}
				break;
			case "Comment":
				const commentUser = data.user?.name || "someone";
				switch (action) {
					case "create":
						return `New comment added by ${commentUser}.`;
					case "update":
						return `Comment updated by ${commentUser}.`;
					case "remove":
						return `Comment deleted by ${commentUser}.`;
				}
				break;
			default:
				return `${type} ${action}d in Linear.`;
		}
		return `${type} ${action}d in Linear.`;
	}
}