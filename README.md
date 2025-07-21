# Beacon

> A minimalist dynamic DNS service that just works

<img width="1920" height="996" alt="beacon_screen" src="https://github.com/user-attachments/assets/ef095940-4946-4064-a9be-49e079b5e146" />

Beacon is a clean, simple dynamic DNS service that keeps your Cloudflare DNS records pointed to the right IP address. No fuss, no complicated setup, just a nice interface that tells you what's happening.

## Why I Built This

I wanted something that looked good and worked easily. The other DDNS options I found were either:
- Complicated to set up
- Had confusing interfaces  
- Did way more than I needed

I just wanted a simple program that keeps a DNS record updated and tells me when it does it. So I built Beacon.

## Features

**Minimalist interface** - Clean, Notion-inspired design  
**Automatic IP monitoring** - Checks every 10 minutes (configurable 1-60 min)   
**Update history** - See recent changes at a glance  
**IP privacy** - Shows obfuscated IPs so you can internet face it
**Force updates** - Manual refresh when you need it  
**Rate limiting** - Built-in protection against abuse  

## Quick Start

1. **Clone and install**
   ```bash
   git clone <this-repo>
   cd beacon
   npm install
   ```

2. **Set up your environment**
   ```bash
   cp .env.example .env
   # Edit .env with your Cloudflare details
   ```

3. **Run it**
   ```bash
   npm run build
   npm start
   ```

4. **Open http://localhost:3000** and you're done!

## Docker Setup (Recommended for Production)

If you prefer Docker (great for servers), it's even easier:

```bash
# Clone the repo
git clone <this-repo>
cd beacon

# Copy environment file
cp .env.example .env
# Edit .env with your Cloudflare details

# Run with Docker Compose
docker-compose up -d
```

That's it! Beacon will be running at http://localhost:3000 with automatic restarts and health checks.

### Manual Docker Build

```bash
# Build the image
docker build -t beacon .

# Run the container
docker run -d \
  --name beacon \
  -p 3000:3000 \
  --env-file .env \
  -v $(pwd)/data:/app/data \
  -v $(pwd)/logs:/app/logs \
  --restart unless-stopped \
  beacon
```

## Environment Setup

Create a `.env` file with your Cloudflare credentials:

```env
# Required - Get these from your Cloudflare dashboard
CLOUDFLARE_API_TOKEN=your_api_token_here
CLOUDFLARE_ZONE_ID=your_zone_id_here  
DNS_RECORD_NAME=your-domain.com

# Optional - Customize if needed
CHECK_INTERVAL_MINUTES=10  # How often to check (1-60 minutes)
PORT=3000                  # Web interface port
```

### Getting Cloudflare Credentials

1. **API Token**: Go to Cloudflare dashboard → My Profile → API Tokens → Create Token
   - Use "Edit zone DNS" template
   - Select your domain zone
   
2. **Zone ID**: In your domain's dashboard, scroll down to see "Zone ID" in the right sidebar

3. **DNS Record Name**: The domain/subdomain you want to update (e.g., `home.yourdomain.com`)

## That's It

Beacon will start monitoring your IP and update your DNS record when it changes. The web interface shows your current status and recent updates.

Simple, clean, and it just works.

## Development

```bash
npm run dev    # Start with auto-reload
npm run build  # Build for production
```

Built with TypeScript, Express, and a focus on simplicity.
