/** Lightweight User-Agent parsing for session/device labels ("Chrome 129 · Windows 11", "iPhone · iOS 18"). */
export interface ParsedUA {
  browser: string | null;
  os: string | null;
  device: string;
  deviceType: 'desktop' | 'mobile' | 'tablet';
}

export function parseUserAgent(ua: string | null | undefined, fallbackName?: string | null): ParsedUA {
  const s = ua ?? '';
  const ver = (re: RegExp) => re.exec(s)?.[1]?.split('.')[0];
  let browser: string | null = null;
  if (/Edg\//.test(s)) browser = `Edge ${ver(/Edg\/([\d.]+)/) ?? ''}`.trim();
  else if (/OPR\//.test(s)) browser = `Opera ${ver(/OPR\/([\d.]+)/) ?? ''}`.trim();
  else if (/Firefox\//.test(s)) browser = `Firefox ${ver(/Firefox\/([\d.]+)/) ?? ''}`.trim();
  else if (/Chrome\//.test(s)) browser = `${/Mobile/.test(s) ? 'Chrome Mobile' : 'Chrome'} ${ver(/Chrome\/([\d.]+)/) ?? ''}`.trim();
  else if (/Safari\//.test(s) && /Version\//.test(s)) browser = `Safari ${ver(/Version\/([\d.]+)/) ?? ''}`.trim();
  else if (/Expo|okhttp|CFNetwork|ReactNative|Darwin/i.test(s)) browser = null;

  let os: string | null = null;
  if (/Windows NT 10/.test(s)) os = 'Windows';
  else if (/Windows/.test(s)) os = 'Windows';
  else if (/iPad/.test(s)) os = `iPadOS ${ver(/OS (\d+)_/) ?? ''}`.trim();
  else if (/iPhone|iOS/.test(s)) os = `iOS ${ver(/OS (\d+)_/) ?? ''}`.trim();
  else if (/Android/.test(s)) os = `Android ${ver(/Android ([\d.]+)/) ?? ''}`.trim();
  else if (/Mac OS X/.test(s)) os = 'macOS';
  else if (/Linux/.test(s)) os = 'Linux';

  const deviceType: ParsedUA['deviceType'] = /iPad|Tablet/.test(s) ? 'tablet' : /Mobile|iPhone|Android/.test(s) ? 'mobile' : 'desktop';
  const device = fallbackName?.trim() || [browser?.split(' ')[0] ?? (os ? 'EDUWAY App' : null), os].filter(Boolean).join(' · ') || 'Unknown device';
  return { browser, os, device, deviceType };
}
