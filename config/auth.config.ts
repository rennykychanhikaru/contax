import type { Provider } from '@supabase/supabase-js';

const authConfig = {
  providers: {
    password: true,
    magicLink: false,
    otp: false,
    oAuth: [] as Provider[],
  },
};

export default authConfig;