import * as actions from "@/lib/actions";
import { handle } from "@/lib/api";

export const dynamic = "force-dynamic";

/** GET /api/onboarding — "İlk adımlar" kartının maddeleri (yalnızca okuma) */
export async function GET() {
  return handle(() => actions.getOnboardingStatus());
}
