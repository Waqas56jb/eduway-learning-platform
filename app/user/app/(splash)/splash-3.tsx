import { OnboardingPager } from '@/components/onboarding';

/** Onboarding slide 3 (deep-linkable); swiping/Next stays inside the pager. */
export default function Splash3Screen() {
  return <OnboardingPager initialIndex={2} />;
}
