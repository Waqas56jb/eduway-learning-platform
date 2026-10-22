import { OnboardingPager } from '@/components/onboarding';

/** Onboarding slide 1 (deep-linkable); swiping/Next stays inside the pager. */
export default function Splash1Screen() {
  return <OnboardingPager initialIndex={0} />;
}
