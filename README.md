# Linear to Discord Webhook Middleware

This project provides a simple Node.js Express application that acts as a middleware between Linear webhooks and Discord webhooks. It listens for issue creation, update, and deletion events from Linear, transforms the data into a user-friendly format, and sends it to a specified Discord channel.

## Features

- Receives Linear webhook events for issues (created, updated, deleted).
- Verifies Linear webhook signatures for added security.
- Transforms Linear payload into rich Discord embed messages.
- Sends notifications to a Discord webhook URL.
- Built with TypeScript for type safety.

## Project Structure

```text
.
├── .env.example
├── package.json
├── pnpm-lock.yaml
├── tsconfig.json
└── src/
    └── index.ts
```

## Setup

### 1. Clone the Repository

```bash
git clone https://github.com/tryteaser/linear-discord-middleware.git
cd linear-discord-middleware
```

### 2. Install Dependencies

This project uses [pnpm](https://pnpm.io/) for package management.

```bash
pnpm install
```

### 3. Configure Environment Variables

Create a file named `.env` in the root of your project and add the following variables. You can use the `.env.example` file as a template.

```env
# The port your server will listen on (e.g., 3000)
PORT=3000

# The URL of the Discord webhook you created in your Discord server settings.
DISCORD_WEBHOOK_URL=YOUR_DISCORD_WEBHOOK_URL_HERE

# (Optional but Recommended) The signing secret from your Linear webhook settings.
# This is used to verify that the webhook request truly comes from Linear.
LINEAR_WEBHOOK_SECRET=YOUR_LINEAR_WEBHOOK_SECRET_HERE
```

### 4. Set up Discord Webhook

1. In your Discord server, go to **Server Settings -> Integrations -> Webhooks**.
2. Click **New Webhook**, give it a name (e.g., "Linear Notifications"), and choose the channel.
3. Copy the **Webhook URL** and paste it into your `.env` file.

### 5. Set up Linear Webhook

1. In your Linear workspace, go to **Settings -> API -> Webhooks**.
2. Click **New webhook**.
3. **URL**: Enter the public URL of your deployed middleware (e.g., `https://your-domain.com/linear-webhook`). For local testing, use a tool like [ngrok](https://ngrok.com/) to expose your local server (e.g., `ngrok http 3000`).
4. **Secret**: (Optional but Recommended) Enter a secret string. This must match the `LINEAR_WEBHOOK_SECRET` in your `.env` file.
5. **Resource Types**: Select **Issue** and ensure **Created**, **Updated**, and **Deleted** events are checked.

## Running the Project

### Development

For development with automatic restarts when files change, run:

```bash
pnpm dev
```

The server will start on the port specified in your `.env` file (default: 3000).

### Production

For production use, first build the TypeScript source code:

```bash
pnpm build
```

Then, start the compiled application:

```bash
pnpm start
```

The server will run the compiled JavaScript from the `dist/` directory.

## Deployment

For production, you can deploy this application to any platform that supports Node.js. Some popular options include:

- **Vercel / Netlify**: Ideal for serverless deployment.
- **Heroku**: A simple Platform-as-a-Service (PaaS).
- **AWS / Google Cloud / Azure**: For more advanced cloud infrastructure.
- **A traditional VPS**: If you prefer managing your own server.

Remember to configure your environment variables on your chosen deployment platform.
