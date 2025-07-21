import { z } from "zod";

// Schema for a Linear User
const LinearUserSchema = z
	.object({
		id: z.string().optional(),
		name: z.string(),
		displayName: z.string().optional(),
		email: z.email().optional(),
		avatarUrl: z.url().optional(),
	})
	.loose()
	.optional();

// Schema for a Linear Team
const LinearTeamSchema = z
	.object({
		id: z.string().optional(),
		name: z.string(),
		key: z.string().optional(),
		description: z.string().optional().nullable(),
	})
	.loose()
	.optional();

// Schema for a Linear State
const LinearStateSchema = z
	.object({
		id: z.string().optional(),
		name: z.string(),
		color: z.string().optional(),
		type: z.string().optional(),
	})
	.loose()
	.optional();

// Schema for a Linear Priority
const LinearPrioritySchema = z
	.object({
		id: z.string().optional(),
		name: z.string(),
		priority: z.number().optional(),
	})
	.loose()
	.optional();

// Schema for a Linear Label
const LinearLabelSchema = z
	.object({
		id: z.string().optional(),
		name: z.string(),
		color: z.string().optional(),
		description: z.string().optional().nullable(),
	})
	.loose()
	.optional();

// Schema for a Linear Project
const LinearProjectSchema = z
	.object({
		id: z.string().optional(),
		name: z.string(),
		description: z.string().optional().nullable(),
		url: z.string().optional(),
		state: z.string().optional(),
	})
	.loose()
	.optional();

// Schema for a Linear Cycle
const LinearCycleSchema = z
	.object({
		id: z.string().optional(),
		name: z.string(),
		number: z.number().optional(),
		startsAt: z.string().optional(),
		endsAt: z.string().optional(),
	})
	.loose()
	.optional();

// Schema for a Linear Issue
export const LinearIssueSchema = z
	.object({
		id: z.string(),
		title: z.string(),
		description: z.string().optional().nullable(),
		state: LinearStateSchema,
		assignee: LinearUserSchema,
		creator: LinearUserSchema,
		updater: LinearUserSchema,
		team: LinearTeamSchema,
		priority: LinearPrioritySchema,
		project: LinearProjectSchema,
		cycle: LinearCycleSchema,
		labels: z.array(LinearLabelSchema).optional(),
		createdAt: z.string().optional(),
		updatedAt: z.string().optional(),
		archivedAt: z.string().optional().nullable(),
		identifier: z.string().optional(),
		number: z.number().optional(),
		estimate: z.number().optional().nullable(),
		url: z.string().optional(),
		branchName: z.string().optional(),
		customerTicketCount: z.number().optional(),
	})
	.loose();

// Schema for a Linear Comment
export const LinearCommentSchema = z
	.object({
		id: z.string(),
		body: z.string(),
		user: LinearUserSchema,
		issue: LinearIssueSchema.partial().optional(),
		issueId: z.string().optional(),
		createdAt: z.string().optional(),
		updatedAt: z.string().optional(),
		edited: z.boolean().optional(),
	})
	.loose();

// Schema for base entity data (flexible for all Linear entity types)
const BaseLinearEntitySchema = z.record(z.string(), z.unknown());

// Schema for the overall Linear Webhook Payload (flexible for all entity types)
export const LinearWebhookPayloadSchema = z
	.object({
		action: z.enum(["create", "update", "remove"]),
		type: z.enum([
			"Issue",
			"Comment",
			"Project",
			"Cycle",
			"User",
			"Team",
			"IssueLabel",
			"Reaction",
			"CustomView",
			"Document",
			"Initiative",
			"Roadmap",
			"Attachment",
		]),
		createdAt: z.string(),
		url: z.string().optional(),
		data: z.union([
			LinearIssueSchema,
			LinearCommentSchema,
			BaseLinearEntitySchema, // Fallback for any other entity type
		]),
		updatedFrom: z.union([
			LinearIssueSchema.partial(),
			LinearCommentSchema.partial(),
			BaseLinearEntitySchema,
		]).optional(),
		webhookTimestamp: z.number(),
		webhookId: z.string(),
		organizationId: z.string(),
		// Additional optional fields that may be present
		issueData: LinearIssueSchema.optional(), // For Issue SLA events
		oauthClientId: z.string().optional(), // For OAuth events
	})
	.loose(); // Allow unknown fields to pass through

// Infer TypeScript types from schemas
export type LinearIssue = z.infer<typeof LinearIssueSchema>;
export type LinearComment = z.infer<typeof LinearCommentSchema>;
export type LinearWebhookPayload = z.infer<typeof LinearWebhookPayloadSchema>;