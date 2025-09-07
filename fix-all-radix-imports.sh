#!/bin/bash

cd "/Users/rennychan/Personal Apps/contax/next-supabase-saas-kit-turbo/packages/ui/src"

echo "Fixing all radix-ui imports..."

# Fix all Slot imports
find . -name "*.tsx" -exec sed -i '' "s|from 'radix-ui'|from '@radix-ui/react-slot'|g" {} \;

# Fix specific component imports
sed -i '' "s|import { Dialog as DialogPrimitive } from '@radix-ui/react-slot'|import * as DialogPrimitive from '@radix-ui/react-dialog'|g" shadcn/dialog.tsx
sed -i '' "s|import { Dialog as DialogPrimitive } from '@radix-ui/react-slot'|import * as DialogPrimitive from '@radix-ui/react-dialog'|g" makerkit/cookie-banner.tsx
sed -i '' "s|import { Dialog as SheetPrimitive } from '@radix-ui/react-slot'|import * as SheetPrimitive from '@radix-ui/react-dialog'|g" shadcn/sheet.tsx
sed -i '' "s|import { AlertDialog as AlertDialogPrimitive } from '@radix-ui/react-slot'|import * as AlertDialogPrimitive from '@radix-ui/react-alert-dialog'|g" shadcn/alert-dialog.tsx
sed -i '' "s|import { Tabs as TabsPrimitive } from '@radix-ui/react-slot'|import * as TabsPrimitive from '@radix-ui/react-tabs'|g" shadcn/tabs.tsx
sed -i '' "s|import { Slider as SliderPrimitive } from '@radix-ui/react-slot'|import * as SliderPrimitive from '@radix-ui/react-slider'|g" shadcn/slider.tsx
sed -i '' "s|import { Popover as PopoverPrimitive } from '@radix-ui/react-slot'|import * as PopoverPrimitive from '@radix-ui/react-popover'|g" shadcn/popover.tsx
sed -i '' "s|import { Progress as ProgressPrimitive } from '@radix-ui/react-slot'|import * as ProgressPrimitive from '@radix-ui/react-progress'|g" shadcn/progress.tsx
sed -i '' "s|import { ScrollArea as ScrollAreaPrimitive } from '@radix-ui/react-slot'|import * as ScrollAreaPrimitive from '@radix-ui/react-scroll-area'|g" shadcn/scroll-area.tsx
sed -i '' "s|import { Label as LabelPrimitive } from '@radix-ui/react-slot'|import * as LabelPrimitive from '@radix-ui/react-label'|g" shadcn/label.tsx
sed -i '' "s|import { Label as LabelPrimitive } from '@radix-ui/react-slot'|import * as LabelPrimitive from '@radix-ui/react-label'|g" shadcn/form.tsx
sed -i '' "s|import { NavigationMenu as NavigationMenuPrimitive } from '@radix-ui/react-slot'|import * as NavigationMenuPrimitive from '@radix-ui/react-navigation-menu'|g" shadcn/navigation-menu.tsx
sed -i '' "s|import { Accordion as AccordionPrimitive } from '@radix-ui/react-slot'|import * as AccordionPrimitive from '@radix-ui/react-accordion'|g" shadcn/accordion.tsx
sed -i '' "s|import { Tooltip as TooltipPrimitive } from '@radix-ui/react-slot'|import * as TooltipPrimitive from '@radix-ui/react-tooltip'|g" shadcn/tooltip.tsx
sed -i '' "s|import { Switch as SwitchPrimitives } from '@radix-ui/react-slot'|import * as SwitchPrimitives from '@radix-ui/react-switch'|g" shadcn/switch.tsx
sed -i '' "s|import { RadioGroup as RadioGroupPrimitive } from '@radix-ui/react-slot'|import * as RadioGroupPrimitive from '@radix-ui/react-radio-group'|g" shadcn/radio-group.tsx
sed -i '' "s|import { Avatar as AvatarPrimitive } from '@radix-ui/react-slot'|import * as AvatarPrimitive from '@radix-ui/react-avatar'|g" shadcn/avatar.tsx
sed -i '' "s|import { Collapsible as CollapsiblePrimitive } from '@radix-ui/react-slot'|import * as CollapsiblePrimitive from '@radix-ui/react-collapsible'|g" shadcn/collapsible.tsx
sed -i '' "s|import { DropdownMenu as DropdownMenuPrimitive } from '@radix-ui/react-slot'|import * as DropdownMenuPrimitive from '@radix-ui/react-dropdown-menu'|g" shadcn/dropdown-menu.tsx
sed -i '' "s|import { Select as SelectPrimitive } from '@radix-ui/react-slot'|import * as SelectPrimitive from '@radix-ui/react-select'|g" shadcn/select.tsx

echo "Done fixing all radix-ui imports!"