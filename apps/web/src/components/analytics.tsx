import { useEffect } from "react";

import { useSiteSettingValue } from "@/hooks/use-site-settings";

/**
 * Injects the Umami analytics script when the `umami-url` and
 * `umami-website-id` site settings are configured.
 *
 * @returns `null` — this component renders nothing.
 */
export function Analytics() {
  const umamiUrl = useSiteSettingValue("umami-url");
  const umamiWebsiteId = useSiteSettingValue("umami-website-id");

  useEffect(() => {
    if (!umamiUrl || !umamiWebsiteId) {
      return;
    }

    const script = document.createElement("script");
    script.defer = true;
    script.src = `${umamiUrl}/script.js`;
    script.dataset.websiteId = umamiWebsiteId;
    document.head.append(script);

    return () => {
      script.remove();
    };
  }, [umamiUrl, umamiWebsiteId]);

  return null;
}
