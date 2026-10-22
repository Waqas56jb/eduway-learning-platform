import { OnboardingPager } from '@/components/onboarding';

/** Onboarding slide 2 (deep-linkable); swiping/Next stays inside the pager. */
export default function Splash2Screen() {
  return <OnboardingPager initialIndex={1} />;
}
