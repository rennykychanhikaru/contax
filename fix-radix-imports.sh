#!/bin/bash

# Fix radix-ui imports in the Makerkit UI package
cd "next-supabase-saas-kit-turbo/packages/ui/src"

# Fix each import pattern
echo "Fixing radix-ui imports..."

# accordion
sed -i '' "s|from 'radix-ui/react-accordion'|from '@radix-ui/react-accordion'|g" shadcn/accordion.tsx

# alert-dialog
sed -i '' "s|from 'radix-ui/react-alert-dialog'|from '@radix-ui/react-alert-dialog'|g" shadcn/alert-dialog.tsx

# avatar
sed -i '' "s|from 'radix-ui/react-avatar'|from '@radix-ui/react-avatar'|g" shadcn/avatar.tsx

# breadcrumb
sed -i '' "s|from 'radix-ui/react-slot'|from '@radix-ui/react-slot'|g" shadcn/breadcrumb.tsx

# checkbox
sed -i '' "s|from 'radix-ui/react-checkbox'|from '@radix-ui/react-checkbox'|g" shadcn/checkbox.tsx

# collapsible
sed -i '' "s|from 'radix-ui/react-collapsible'|from '@radix-ui/react-collapsible'|g" shadcn/collapsible.tsx

# dialog
sed -i '' "s|from 'radix-ui/react-dialog'|from '@radix-ui/react-dialog'|g" shadcn/dialog.tsx

# dropdown-menu
sed -i '' "s|from 'radix-ui/react-dropdown-menu'|from '@radix-ui/react-dropdown-menu'|g" shadcn/dropdown-menu.tsx

# form
sed -i '' "s|from 'radix-ui/react-label'|from '@radix-ui/react-label'|g" shadcn/form.tsx
sed -i '' "s|from 'radix-ui/react-slot'|from '@radix-ui/react-slot'|g" shadcn/form.tsx

# label
sed -i '' "s|from 'radix-ui/react-label'|from '@radix-ui/react-label'|g" shadcn/label.tsx

# navigation-menu
sed -i '' "s|from 'radix-ui/react-navigation-menu'|from '@radix-ui/react-navigation-menu'|g" shadcn/navigation-menu.tsx

# popover
sed -i '' "s|from 'radix-ui/react-popover'|from '@radix-ui/react-popover'|g" shadcn/popover.tsx

# progress
sed -i '' "s|from 'radix-ui/react-progress'|from '@radix-ui/react-progress'|g" shadcn/progress.tsx

# radio-group
sed -i '' "s|from 'radix-ui/react-radio-group'|from '@radix-ui/react-radio-group'|g" shadcn/radio-group.tsx

# scroll-area
sed -i '' "s|from 'radix-ui/react-scroll-area'|from '@radix-ui/react-scroll-area'|g" shadcn/scroll-area.tsx

# select
sed -i '' "s|from 'radix-ui/react-select'|from '@radix-ui/react-select'|g" shadcn/select.tsx

# sheet
sed -i '' "s|from 'radix-ui/react-dialog'|from '@radix-ui/react-dialog'|g" shadcn/sheet.tsx

# sidebar
sed -i '' "s|from 'radix-ui/react-slot'|from '@radix-ui/react-slot'|g" shadcn/sidebar.tsx

# slider
sed -i '' "s|from 'radix-ui/react-slider'|from '@radix-ui/react-slider'|g" shadcn/slider.tsx

# switch
sed -i '' "s|from 'radix-ui/react-switch'|from '@radix-ui/react-switch'|g" shadcn/switch.tsx

# tabs
sed -i '' "s|from 'radix-ui/react-tabs'|from '@radix-ui/react-tabs'|g" shadcn/tabs.tsx

# tooltip
sed -i '' "s|from 'radix-ui/react-tooltip'|from '@radix-ui/react-tooltip'|g" shadcn/tooltip.tsx

# Fix makerkit components
sed -i '' "s|from 'radix-ui/react-slot'|from '@radix-ui/react-slot'|g" makerkit/multi-step-form.tsx
sed -i '' "s|from 'radix-ui/react-slot'|from '@radix-ui/react-slot'|g" makerkit/card-button.tsx
sed -i '' "s|from 'radix-ui/react-slot'|from '@radix-ui/react-slot'|g" makerkit/cookie-banner.tsx
sed -i '' "s|from 'radix-ui/react-slot'|from '@radix-ui/react-slot'|g" makerkit/marketing/pill.tsx
sed -i '' "s|from 'radix-ui/react-slot'|from '@radix-ui/react-slot'|g" makerkit/marketing/hero-title.tsx
sed -i '' "s|from 'radix-ui/react-slot'|from '@radix-ui/react-slot'|g" makerkit/marketing/gradient-secondary-text.tsx

echo "Done fixing radix-ui imports!"