#!/bin/bash

echo "🔨 Building Beacon..."

# Install dependencies if node_modules doesn't exist
if [ ! -d "node_modules" ]; then
    echo "📦 Installing dependencies..."
    npm install
fi

# Compile server TypeScript
echo "🔧 Compiling server TypeScript..."
npx tsc

# Compile client TypeScript
echo "🎨 Compiling client TypeScript..."
npx tsc public/client.ts --outFile public/client.js --target ES2022 --lib DOM,ES2022 --skipLibCheck

# Check if compilation was successful
if [ $? -eq 0 ]; then
    echo "✅ Build completed successfully!"
    echo ""
    echo "🚀 To start the service:"
    echo "   npm run start"
    echo ""
    echo "🛠️  To start in development mode:"
    echo "   npm run dev"
else
    echo "❌ Build failed!"
    exit 1
fi