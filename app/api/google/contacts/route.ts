import { NextResponse, type NextRequest } from "next/server";

import { getGoogleAccessToken } from "@/lib/google-session";

export const dynamic = "force-dynamic";

type PeopleResponse = {
  connections?: Array<{
    names?: Array<{ displayName?: string }>;
    emailAddresses?: Array<{ value?: string }>;
  }>;
};

export async function GET(request: NextRequest) {
  try {
    const query = request.nextUrl.searchParams.get("q")?.trim().toLocaleLowerCase("fr-FR") ?? "";
    if (query.length < 2 || query.length > 100) {
      return NextResponse.json({ success: true, data: [] }, { headers: { "Cache-Control": "private, max-age=30" } });
    }
    const accessToken = await getGoogleAccessToken(request);
    const url = new URL("https://people.googleapis.com/v1/people/me/connections");
    url.searchParams.set("personFields", "names,emailAddresses");
    url.searchParams.set("pageSize", "500");
    url.searchParams.set("sortOrder", "LAST_NAME_ASCENDING");
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json" },
      cache: "no-store",
    });
    if (!response.ok) {
      return NextResponse.json(
        { success: false, error: response.status === 403 ? "Reconnectez Google pour autoriser les suggestions de contacts." : "Les contacts Google sont indisponibles." },
        { status: response.status === 403 ? 403 : 502 },
      );
    }
    const people = (await response.json()) as PeopleResponse;
    const contacts = (people.connections ?? [])
      .flatMap((person) =>
        (person.emailAddresses ?? []).map((address) => ({
          name: person.names?.[0]?.displayName?.trim() || address.value || "Contact",
          email: address.value?.trim() || "",
        })),
      )
      .filter((contact) => contact.email && `${contact.name} ${contact.email}`.toLocaleLowerCase("fr-FR").includes(query))
      .slice(0, 8);
    return NextResponse.json({ success: true, data: contacts }, { headers: { "Cache-Control": "private, max-age=60" } });
  } catch {
    return NextResponse.json({ success: false, error: "Les contacts Google sont indisponibles." }, { status: 500 });
  }
}
