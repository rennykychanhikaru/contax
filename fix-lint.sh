#!/bin/bash

echo "Fixing lint errors systematically..."

# Fix unused req parameters in route handlers
echo "Fixing unused 'req' parameters in route handlers..."
find app/api -name "*.ts" -exec sed -i '' 's/export async function GET(req: NextRequest)/export async function GET(_req: NextRequest)/g' {} \;
find app/api -name "*.ts" -exec sed -i '' 's/export async function POST(req: NextRequest)/export async function POST(_req: NextRequest)/g' {} \;
find app/api -name "*.ts" -exec sed -i '' 's/export async function DELETE(req: NextRequest)/export async function DELETE(_req: NextRequest)/g' {} \;
find app/api -name "*.ts" -exec sed -i '' 's/export async function PUT(req: NextRequest)/export async function PUT(_req: NextRequest)/g' {} \;
find app/api -name "*.ts" -exec sed -i '' 's/export async function PATCH(req: NextRequest)/export async function PATCH(_req: NextRequest)/g' {} \;

# Fix 'any' types to 'unknown' where safe
echo "Fixing 'any' types..."
find app lib components -name "*.ts" -o -name "*.tsx" | while read file; do
  # Replace : any with : unknown for catch blocks
  sed -i '' 's/catch (error: any)/catch (error)/g' "$file"
  sed -i '' 's/catch (e: any)/catch (e)/g' "$file"

  # Replace generic any with unknown for safer typing
  sed -i '' 's/: any\[\]/: unknown[]/g' "$file"
  sed -i '' 's/<any>/<unknown>/g' "$file"
done

# Fix empty catch blocks
echo "Fixing empty catch blocks..."
find app lib components -name "*.ts" -o -name "*.tsx" | while read file; do
  sed -i '' 's/} catch (.*) {[[:space:]]*}/} catch (error) { console.error(error) }/g' "$file"
done

echo "Running ESLint auto-fix..."
npx eslint --fix app lib components 2>/dev/null || true

echo "Done! Now checking remaining errors..."
npm run lint 2>&1 | tail -20