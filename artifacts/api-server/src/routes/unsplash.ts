import { Router, type IRouter, type Response } from "express";
import {
  GetDishInspirationResponse,
  TrackUnsplashPhotoDownloadBody,
} from "@workspace/api-zod";
import { CITY_SETTINGS } from "../city";

const router: IRouter = Router();
const UNSPLASH_API = "https://api.unsplash.com";
const ATTRIBUTION_SOURCE = "birmingham_al_city_guide";

function getDishSearchQuery(): string {
  const cityName = CITY_SETTINGS.name.split(",")[0].trim();
  const dish = CITY_SETTINGS.favoriteDish.trim();
  return dish.toLowerCase().startsWith(`${cityName.toLowerCase()} `)
    ? dish.slice(cityName.length).trim()
    : dish;
}

type UnsplashPhoto = {
  id?: string;
  alt_description?: string | null;
  description?: string | null;
  urls?: { regular?: string; raw?: string };
  links?: { download_location?: string };
  user?: {
    name?: string;
    links?: { html?: string };
  };
};

type UnsplashSearchResponse = {
  results?: UnsplashPhoto[];
};

function getAccessKey(): string | undefined {
  return (
    process.env.UNSPLASH_ACCESS_KEY?.trim() ||
    process.env.UNSPLASH_API_KEY?.trim()
  );
}

function withAttribution(urlValue: string): string {
  const url = new URL(urlValue);
  if (
    url.protocol !== "https:" ||
    !["unsplash.com", "www.unsplash.com"].includes(url.hostname)
  ) {
    throw new Error("Unsplash returned an invalid photographer profile URL.");
  }

  url.searchParams.set("utm_source", ATTRIBUTION_SOURCE);
  url.searchParams.set("utm_medium", "referral");
  return url.toString();
}

function unavailable(res: Response): void {
  res.status(503).json({
    error:
      "Food inspiration is not configured yet. Add an UNSPLASH_ACCESS_KEY secret to enable it.",
  });
}

router.get("/unsplash/dish-inspiration", async (req, res): Promise<void> => {
  const accessKey = getAccessKey();
  if (!accessKey) {
    unavailable(res);
    return;
  }

  const searchUrl = new URL(`${UNSPLASH_API}/search/photos`);
  searchUrl.searchParams.set("query", getDishSearchQuery());
  searchUrl.searchParams.set("per_page", "6");
  searchUrl.searchParams.set("content_filter", "high");

  try {
    const response = await fetch(searchUrl, {
      headers: {
        Authorization: `Client-ID ${accessKey}`,
        "Accept-Version": "v1",
      },
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) {
      req.log.warn(
        { status: response.status },
        "Unsplash inspiration search failed",
      );
      res.status(502).json({
        error: "Food inspiration could not load right now. Please try again.",
      });
      return;
    }

    const searchResults = (await response.json()) as UnsplashSearchResponse;
    const photos = (searchResults.results ?? []).slice(0, 6).flatMap((photo) => {
      const id = photo.id;
      const imageUrl = photo.urls?.regular;
      const rawUrl = photo.urls?.raw;
      const photographerName = photo.user?.name;
      const photographerProfile = photo.user?.links?.html;
      const downloadLocation = photo.links?.download_location;

      if (
        !id ||
        !imageUrl ||
        !rawUrl ||
        !photographerName ||
        !photographerProfile ||
        !downloadLocation
      ) {
        return [];
      }

      try {
        return [
          {
            id,
            imageUrl,
            rawUrl,
            altText:
              photo.alt_description?.trim() ||
              photo.description?.trim() ||
              `Food inspiration photo by ${photographerName}`,
            photographerName,
            photographerProfileUrl: withAttribution(photographerProfile),
            downloadLocation,
          },
        ];
      } catch {
        return [];
      }
    });

    res.setHeader("Cache-Control", "no-store");
    res.json(GetDishInspirationResponse.parse(photos));
  } catch (err) {
    req.log.error({ err }, "Unsplash inspiration request failed");
    res.status(502).json({
      error: "Food inspiration could not load right now. Please try again.",
    });
  }
});

router.post(
  "/unsplash/dish-inspiration/download",
  async (req, res): Promise<void> => {
    const parsed = TrackUnsplashPhotoDownloadBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "The photo download event was invalid." });
      return;
    }

    let downloadUrl: URL;
    try {
      downloadUrl = new URL(parsed.data.downloadLocation);
    } catch {
      res.status(400).json({ error: "The photo download URL was invalid." });
      return;
    }

    const photoPath = /^\/photos\/([A-Za-z0-9_-]+)\/download$/.exec(
      downloadUrl.pathname,
    );
    if (
      downloadUrl.origin !== UNSPLASH_API ||
      !photoPath ||
      photoPath[1] !== parsed.data.photoId
    ) {
      res.status(400).json({ error: "The photo download URL was invalid." });
      return;
    }

    const accessKey = getAccessKey();
    if (!accessKey) {
      unavailable(res);
      return;
    }

    try {
      const response = await fetch(downloadUrl, {
        headers: {
          Authorization: `Client-ID ${accessKey}`,
          "Accept-Version": "v1",
        },
        signal: AbortSignal.timeout(8_000),
      });
      if (!response.ok) {
        req.log.warn(
          { photoId: parsed.data.photoId, status: response.status },
          "Unsplash download event failed",
        );
        res.status(502).json({
          error: "The inspiration photo could not be opened right now.",
        });
        return;
      }

      res.sendStatus(204);
    } catch (err) {
      req.log.error(
        { err, photoId: parsed.data.photoId },
        "Unsplash download event request failed",
      );
      res.status(502).json({
        error: "The inspiration photo could not be opened right now.",
      });
    }
  },
);

export default router;
