'use client';

import { useRouter } from 'next/navigation';
import { createBrowserClient } from '@supabase/ssr';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { ChevronDownIcon, GearIcon, ExitIcon } from '@radix-ui/react-icons';
import Link from 'next/link';

interface UserDropdownMenuProps {
  email: string;
}

export default function UserDropdownMenu({ email }: UserDropdownMenuProps) {
  const router = useRouter();
  
  const handleSignOut = async () => {
    const supabase = createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );
    
    await supabase.auth.signOut();
    router.push('/auth/sign-in');
  };

  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <button className="flex items-center gap-1 text-sm text-gray-400 hover:text-gray-200 px-2 py-1 rounded-md hover:bg-gray-800 transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-600">
          {email}
          <ChevronDownIcon className="h-4 w-4" />
        </button>
      </DropdownMenu.Trigger>

      <DropdownMenu.Portal>
        <DropdownMenu.Content 
          className="min-w-[220px] bg-gray-900 rounded-md p-1 shadow-lg border border-gray-700 z-50"
          sideOffset={5}
          align="end"
        >
          <DropdownMenu.Item className="outline-none">
            <Link 
              href="/settings" 
              className="flex items-center gap-2 px-3 py-2 text-sm text-gray-300 hover:bg-gray-800 rounded cursor-pointer w-full"
            >
              <GearIcon className="h-4 w-4" />
              Settings
            </Link>
          </DropdownMenu.Item>
          
          <DropdownMenu.Separator className="h-[1px] bg-gray-700 my-1" />
          
          <DropdownMenu.Item 
            className="flex items-center gap-2 px-3 py-2 text-sm text-gray-300 hover:bg-gray-800 rounded cursor-pointer outline-none"
            onSelect={handleSignOut}
          >
            <ExitIcon className="h-4 w-4" />
            Sign out
          </DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}