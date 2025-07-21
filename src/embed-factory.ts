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
			project,
			cycle,
			labels,
			estimate,
			identifier,
			number,
			customerTicketCount,
			createdAt,
		} = issueData;

		// Build comprehensive description with issue details
		let fullDescription = "";
		if (description) {
			fullDescription = description.length > 300 
				? `${description.substring(0, 300)}...` 
				: description;
		} else {
			fullDescription = "*No description provided*";
		}

		// Add contextual information
		const contextInfo: string[] = [];
		if (project?.name) contextInfo.push(`📋 **Project:** ${project.name}`);
		if (cycle?.name) contextInfo.push(`🔄 **Cycle:** ${cycle.name}`);
		if (labels && labels.length > 0) {
			const labelNames = labels.map(l => l?.name).filter(Boolean).join(", ");
			if (labelNames) contextInfo.push(`🏷️ **Labels:** ${labelNames}`);
		}
		if (estimate) contextInfo.push(`⏱️ **Estimate:** ${estimate} pts`);
		if (customerTicketCount && customerTicketCount > 0) {
			contextInfo.push(`👥 **Customer Requests:** ${customerTicketCount}`);
		}

		if (contextInfo.length > 0) {
			fullDescription += "\n\n" + contextInfo.join("\n");
		}

		const fields = [
			{ name: "🏢 Team", value: team?.name || "Unknown Team", inline: true },
			{ name: "📊 Status", value: state?.name || "No Status", inline: true },
			{ name: "⚡ Priority", value: priority?.name || "No Priority", inline: true },
			{ name: "👤 Assignee", value: assignee?.displayName || assignee?.name || "Unassigned", inline: true },
			{ name: "✨ Created By", value: creator?.displayName || creator?.name || "Unknown", inline: true },
			{ name: "🔢 Issue ID", value: `${identifier || `#${number}` || id}`, inline: true },
		];

		// Add project milestone/dates if available
		if (cycle?.startsAt || cycle?.endsAt) {
			const cycleInfo = [];
			if (cycle.startsAt) cycleInfo.push(`Starts: ${new Date(cycle.startsAt).toLocaleDateString()}`);
			if (cycle.endsAt) cycleInfo.push(`Ends: ${new Date(cycle.endsAt).toLocaleDateString()}`);
			fields.push({ name: "📅 Cycle Timeline", value: cycleInfo.join(" • "), inline: false });
		}

		return {
			title: `🆕 Issue Created: ${title}`,
			url: url,
			description: fullDescription.substring(0, 4096), // Discord limit
			color: 3066993, // Green
			fields,
			footer: {
				text: `Linear Issue Tracker • Created ${createdAt ? new Date(createdAt).toLocaleString() : 'just now'}`,
				icon_url: "https://linear.app/static/linear-logo.png",
			},
			timestamp: createdAt || new Date().toISOString(),
		};
	}

	private static createIssueUpdateEmbed(
		issueData: LinearIssue,
		url: string,
		updatedFrom: Partial<LinearIssue> = {}
	): DiscordEmbed {
		const { 
			id, 
			title, 
			description,
			state, 
			assignee, 
			team, 
			priority, 
			project,
			cycle,
			labels,
			estimate,
			identifier,
			number,
			updater,
			updatedAt,
		} = issueData;
		
		const changes: string[] = [];

		// Track comprehensive changes with emojis
		if (updatedFrom.state && state && updatedFrom.state.name !== state.name) {
			changes.push(`📊 **Status:** ${updatedFrom.state.name} → **${state.name}**`);
		}
		if (updatedFrom.assignee?.name !== assignee?.name) {
			const oldAssignee = updatedFrom.assignee?.displayName || updatedFrom.assignee?.name || "Unassigned";
			const newAssignee = assignee?.displayName || assignee?.name || "Unassigned";
			changes.push(`👤 **Assignee:** ${oldAssignee} → **${newAssignee}**`);
		}
		if (updatedFrom.title && updatedFrom.title !== title) {
			changes.push(`📝 **Title:** ${updatedFrom.title} → **${title}**`);
		}
		if (updatedFrom.priority?.name !== priority?.name) {
			const oldPriority = updatedFrom.priority?.name || "No Priority";
			const newPriority = priority?.name || "No Priority";
			changes.push(`⚡ **Priority:** ${oldPriority} → **${newPriority}**`);
		}
		if (updatedFrom.project?.name !== project?.name) {
			const oldProject = updatedFrom.project?.name || "None";
			const newProject = project?.name || "None";
			changes.push(`📋 **Project:** ${oldProject} → **${newProject}**`);
		}
		if (updatedFrom.cycle?.name !== cycle?.name) {
			const oldCycle = updatedFrom.cycle?.name || "None";
			const newCycle = cycle?.name || "None";
			changes.push(`🔄 **Cycle:** ${oldCycle} → **${newCycle}**`);
		}
		if (updatedFrom.estimate !== estimate) {
			const oldEstimate = updatedFrom.estimate ? `${updatedFrom.estimate} pts` : "None";
			const newEstimate = estimate ? `${estimate} pts` : "None";
			changes.push(`⏱️ **Estimate:** ${oldEstimate} → **${newEstimate}**`);
		}

		// Handle label changes (simplified comparison)
		if (updatedFrom.labels && labels) {
			const oldLabels = updatedFrom.labels?.map(l => l?.name).filter(Boolean) || [];
			const newLabels = labels?.map(l => l?.name).filter(Boolean) || [];
			if (JSON.stringify(oldLabels.sort()) !== JSON.stringify(newLabels.sort())) {
				const oldLabelStr = oldLabels.length > 0 ? oldLabels.join(", ") : "None";
				const newLabelStr = newLabels.length > 0 ? newLabels.join(", ") : "None";
				changes.push(`🏷️ **Labels:** ${oldLabelStr} → **${newLabelStr}**`);
			}
		}

		// Description change (show if description was added/removed/changed)
		if (updatedFrom.description !== description) {
			if (!updatedFrom.description && description) {
				changes.push(`📄 **Description:** Added`);
			} else if (updatedFrom.description && !description) {
				changes.push(`📄 **Description:** Removed`);
			} else if (updatedFrom.description && description) {
				changes.push(`📄 **Description:** Updated`);
			}
		}

		// Build enhanced description
		let fullDescription = "";
		if (changes.length > 0) {
			fullDescription = "**Changes Made:**\n" + changes.join("\n");
		} else {
			fullDescription = "Issue details have been updated.";
		}

		// Add current description if it exists and is short enough
		if (description && fullDescription.length + description.length < 3500) {
			fullDescription += `\n\n**Current Description:**\n${description.substring(0, 500)}${description.length > 500 ? "..." : ""}`;
		}

		const fields = [
			{ name: "🏢 Team", value: team?.name || "Unknown Team", inline: true },
			{ name: "📊 Current Status", value: state?.name || "No Status", inline: true },
			{ name: "👤 Current Assignee", value: assignee?.displayName || assignee?.name || "Unassigned", inline: true },
			{ name: "⚡ Priority", value: priority?.name || "No Priority", inline: true },
			{ name: "🔧 Updated By", value: updater?.displayName || updater?.name || "Unknown", inline: true },
			{ name: "🔢 Issue ID", value: `${identifier || `#${number}` || id}`, inline: true },
		];

		// Add additional context
		if (project?.name) {
			fields.push({ name: "📋 Project", value: project.name, inline: true });
		}
		if (cycle?.name) {
			fields.push({ name: "🔄 Cycle", value: cycle.name, inline: true });
		}
		if (estimate) {
			fields.push({ name: "⏱️ Estimate", value: `${estimate} pts`, inline: true });
		}

		return {
			title: `🔄 Issue Updated: ${title}`,
			url: url,
			description: fullDescription.substring(0, 4096), // Discord limit
			color: 16776960, // Yellow
			fields,
			footer: {
				text: `Linear Issue Tracker • Updated ${updatedAt ? new Date(updatedAt).toLocaleString() : 'just now'}`,
				icon_url: "https://linear.app/static/linear-logo.png",
			},
			timestamp: updatedAt || new Date().toISOString(),
		};
	}

	private static createIssueDeleteEmbed(issueData: LinearIssue): DiscordEmbed {
		const { 
			id, 
			title, 
			team, 
			state, 
			assignee, 
			creator,
			priority,
			project,
			identifier,
			number 
		} = issueData;

		const description = `🗑️ **Issue has been deleted**

The issue **${title}** (\`${identifier || `#${number}` || id}\`) from team **${team?.name || "Unknown Team"}** has been permanently removed.`;

		const fields = [
			{ name: "🏢 Team", value: team?.name || "Unknown Team", inline: true },
			{ name: "📊 Last Status", value: state?.name || "Unknown", inline: true },
			{ name: "👤 Last Assignee", value: assignee?.displayName || assignee?.name || "Unassigned", inline: true },
			{ name: "✨ Created By", value: creator?.displayName || creator?.name || "Unknown", inline: true },
			{ name: "⚡ Priority", value: priority?.name || "No Priority", inline: true },
			{ name: "🔢 Issue ID", value: `${identifier || `#${number}` || id}`, inline: true },
		];

		if (project?.name) {
			fields.push({ name: "📋 Project", value: project.name, inline: true });
		}

		return {
			title: `🗑️ Issue Deleted: ${title}`,
			description,
			color: 15158332, // Red
			fields,
			footer: {
				text: "Linear Issue Tracker • Deleted just now",
				icon_url: "https://linear.app/static/linear-logo.png",
			},
			timestamp: new Date().toISOString(),
		};
	}

	// --- Comment Embed Creators ---

	private static createCommentCreateEmbed(commentData: LinearComment, url: string): DiscordEmbed {
		const { body, user, issue, issueId, createdAt } = commentData;
		
		// Build comprehensive description
		let fullDescription = "";
		if (body) {
			// Format the comment body nicely, preserving some markdown
			fullDescription = body.length > 1500 
				? `${body.substring(0, 1500)}...\n\n*[Comment truncated - click to view full comment]*` 
				: body;
		} else {
			fullDescription = "*No comment content provided*";
		}

		// Add issue context to description
		if (issue?.description) {
			const issueDesc = issue.description.length > 200 
				? `${issue.description.substring(0, 200)}...`
				: issue.description;
			fullDescription += `\n\n**Issue Context:**\n*${issueDesc}*`;
		}

		const fields = [
			{ name: "💬 Comment By", value: user?.displayName || user?.name || "Unknown", inline: true },
			{ name: "📋 Issue", value: issue?.title || `Issue #${issueId}`, inline: true },
			{ name: "🔢 Issue ID", value: issue?.identifier || `#${issue?.number}` || issueId || "Unknown", inline: true },
		];

		// Add issue context fields
		if (issue) {
			if (issue.team?.name) {
				fields.push({ name: "🏢 Team", value: issue.team.name, inline: true });
			}
			if (issue.state?.name) {
				fields.push({ name: "📊 Issue Status", value: issue.state.name, inline: true });
			}
			if (issue.assignee?.name) {
				fields.push({ name: "👤 Issue Assignee", value: issue.assignee.displayName || issue.assignee.name || "Unassigned", inline: true });
			}
			if (issue.priority?.name) {
				fields.push({ name: "⚡ Priority", value: issue.priority.name, inline: true });
			}
			if (issue.project?.name) {
				fields.push({ name: "📋 Project", value: issue.project.name, inline: true });
			}
		}

		// Add user context if available
		if (user?.email) {
			fields.push({ name: "📧 Author Email", value: user.email, inline: true });
		}

		return {
			title: `💬 New Comment Added`,
			url: url,
			description: fullDescription.substring(0, 4096), // Discord limit
			color: 5793266, // Blue
			fields,
			footer: {
				text: `Linear Comment • Posted ${createdAt ? new Date(createdAt).toLocaleString() : 'just now'}`,
				icon_url: "https://linear.app/static/linear-logo.png",
			},
			timestamp: createdAt || new Date().toISOString(),
		};
	}

	private static createCommentUpdateEmbed(commentData: LinearComment, url: string): DiscordEmbed {
		const { body, user, issue, issueId, updatedAt, edited } = commentData;
		
		// Build comprehensive description
		let fullDescription = "";
		if (body) {
			fullDescription = body.length > 1500 
				? `${body.substring(0, 1500)}...\n\n*[Comment truncated - click to view full comment]*` 
				: body;
		} else {
			fullDescription = "*No comment content provided*";
		}

		// Add edit indicator
		fullDescription = `🔄 **Comment has been edited**\n\n${fullDescription}`;

		// Add issue context if available
		if (issue?.description) {
			const issueDesc = issue.description.length > 200 
				? `${issue.description.substring(0, 200)}...`
				: issue.description;
			fullDescription += `\n\n**Issue Context:**\n*${issueDesc}*`;
		}

		const fields = [
			{ name: "💬 Comment By", value: user?.displayName || user?.name || "Unknown", inline: true },
			{ name: "📋 Issue", value: issue?.title || `Issue #${issueId}`, inline: true },
			{ name: "✏️ Status", value: edited ? "Edited" : "Updated", inline: true },
			{ name: "🔢 Issue ID", value: issue?.identifier || `#${issue?.number}` || issueId || "Unknown", inline: true },
		];

		// Add issue context fields
		if (issue) {
			if (issue.team?.name) {
				fields.push({ name: "🏢 Team", value: issue.team.name, inline: true });
			}
			if (issue.state?.name) {
				fields.push({ name: "📊 Issue Status", value: issue.state.name, inline: true });
			}
			if (issue.assignee?.name) {
				fields.push({ name: "👤 Issue Assignee", value: issue.assignee.displayName || issue.assignee.name || "Unassigned", inline: true });
			}
			if (issue.priority?.name) {
				fields.push({ name: "⚡ Priority", value: issue.priority.name, inline: true });
			}
			if (issue.project?.name) {
				fields.push({ name: "📋 Project", value: issue.project.name, inline: true });
			}
		}

		return {
			title: `✏️ Comment Updated`,
			url: url,
			description: fullDescription.substring(0, 4096), // Discord limit
			color: 16776960, // Yellow
			fields,
			footer: {
				text: `Linear Comment • Updated ${updatedAt ? new Date(updatedAt).toLocaleString() : 'just now'}`,
				icon_url: "https://linear.app/static/linear-logo.png",
			},
			timestamp: updatedAt || new Date().toISOString(),
		};
	}

	private static createCommentDeleteEmbed(commentData: LinearComment): DiscordEmbed {
		const { user, issue, issueId } = commentData;
		
		const description = `🗑️ **Comment has been deleted**

Comment by **${user?.displayName || user?.name || "Unknown"}** has been removed from issue **${issue?.title || `#${issueId}`}**.`;

		const fields = [
			{ name: "💬 Comment By", value: user?.displayName || user?.name || "Unknown", inline: true },
			{ name: "📋 Issue", value: issue?.title || `Issue #${issueId}`, inline: true },
			{ name: "🔢 Issue ID", value: issue?.identifier || `#${issue?.number}` || issueId || "Unknown", inline: true },
		];

		// Add issue context if available
		if (issue) {
			if (issue.team?.name) {
				fields.push({ name: "🏢 Team", value: issue.team.name, inline: true });
			}
			if (issue.state?.name) {
				fields.push({ name: "📊 Issue Status", value: issue.state.name, inline: true });
			}
		}

		return {
			title: "🗑️ Comment Deleted",
			description,
			color: 15158332, // Red
			fields,
			footer: {
				text: "Linear Comment • Deleted just now",
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
				const issueUser = data.creator?.displayName || data.creator?.name || data.updater?.displayName || data.updater?.name || "someone";
				const issueTitle = data.title ? `**${data.title}**` : "an issue";
				const teamName = data.team?.name ? ` in **${data.team.name}**` : "";
				const priority = data.priority?.name ? ` with **${data.priority.name}** priority` : "";
				const assignee = data.assignee?.displayName || data.assignee?.name;
				const assigneeText = assignee ? ` and assigned to **${assignee}**` : "";
				
				switch (action) {
					case "create":
						return `🆕 ${issueUser} created ${issueTitle}${teamName}${priority}${assigneeText}`;
					case "update":
						return `🔄 ${issueUser} updated ${issueTitle}${teamName}`;
					case "remove":
						return `🗑️ ${issueUser} deleted ${issueTitle}${teamName}`;
				}
				break;
			case "Comment":
				const commentUser = data.user?.displayName || data.user?.name || "someone";
				const issueContext = data.issue?.title ? ` on **${data.issue.title}**` : ` on issue #${data.issueId}`;
				const issueTeam = data.issue?.team?.name ? ` (${data.issue.team.name})` : "";
				
				switch (action) {
					case "create":
						return `💬 ${commentUser} added a comment${issueContext}${issueTeam}`;
					case "update":
						return `✏️ ${commentUser} edited their comment${issueContext}${issueTeam}`;
					case "remove":
						return `🗑️ ${commentUser}'s comment was deleted${issueContext}${issueTeam}`;
				}
				break;
			case "Project":
				const projectUser = data.creator?.displayName || data.creator?.name || "someone";
				const projectName = data.name ? `**${data.name}**` : "a project";
				switch (action) {
					case "create":
						return `📋 ${projectUser} created project ${projectName}`;
					case "update":
						return `📋 Project ${projectName} was updated`;
					case "remove":
						return `📋 Project ${projectName} was deleted`;
				}
				break;
			case "Team":
				const teamUser = data.creator?.displayName || data.creator?.name || "someone";
				const teamDisplayName = data.name ? `**${data.name}**` : "a team";
				switch (action) {
					case "create":
						return `🏢 ${teamUser} created team ${teamDisplayName}`;
					case "update":
						return `🏢 Team ${teamDisplayName} was updated`;
					case "remove":
						return `🏢 Team ${teamDisplayName} was deleted`;
				}
				break;
			case "Cycle":
				const cycleName = data.name ? `**${data.name}**` : "a cycle";
				switch (action) {
					case "create":
						return `🔄 New cycle ${cycleName} was created`;
					case "update":
						return `🔄 Cycle ${cycleName} was updated`;
					case "remove":
						return `🔄 Cycle ${cycleName} was deleted`;
				}
				break;
			case "IssueLabel":
				const labelName = data.name ? `**${data.name}**` : "a label";
				switch (action) {
					case "create":
						return `🏷️ New label ${labelName} was created`;
					case "update":
						return `🏷️ Label ${labelName} was updated`;
					case "remove":
						return `🏷️ Label ${labelName} was deleted`;
				}
				break;
			default:
				const entityName = data.name || data.title || `${type} ${data.id}`;
				return `${this.getActionEmoji(action)} ${type} **${entityName}** was ${action}d in Linear`;
		}
		return `${this.getActionEmoji(action)} ${type} ${action}d in Linear`;
	}

	/**
	 * Gets emoji for action type
	 */
	private static getActionEmoji(action: string): string {
		switch (action) {
			case "create": return "🆕";
			case "update": return "🔄";
			case "remove": return "🗑️";
			default: return "📝";
		}
	}
}