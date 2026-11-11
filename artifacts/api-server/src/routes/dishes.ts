import { Router, type IRouter } from "express";
import { desc, eq } from "drizzle-orm";
import {
  CreateDishPhotoBody,
  CreateDishPhotoResponse,
  GetDishPhotoImageParams,
  ListDishPhotosResponse,
} from "@workspace/api-zod";
import { db, dishPhotosTable } from "@workspace/db";
import { CITY_SETTINGS } from "../city";
import { inspectDishPhoto } from "../agents/dishInspector";

const router: IRouter = Router();
const MAX_IMAGE_BYTES = 3 * 1024 * 1024;
const SUPPORTED_MIME_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

type ParsedImage = {
  mimeType: "image/jpeg" | "image/png" | "image/webp";
  bytes: Buffer;
};

function parseImageDataUrl(dataUrl: string): ParsedImage | null {
  const match = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/]+={0,2})$/.exec(
    dataUrl,
  );
  if (!match) return null;

  const mimeType = match[1];
  const encoded = match[2];
  if (!SUPPORTED_MIME_TYPES.has(mimeType)) return null;

  const bytes = Buffer.from(encoded, "base64");
  if (
    bytes.length === 0 ||
    bytes.length > MAX_IMAGE_BYTES ||
    bytes.toString("base64") !== encoded
  ) {
    return null;
  }

  const isJpeg =
    mimeType === "image/jpeg" &&
    bytes[0] === 0xff &&
    bytes[1] === 0xd8 &&
    bytes[2] === 0xff;
  const isPng =
    mimeType === "image/png" &&
    bytes.subarray(0, 8).equals(
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    );
  const isWebp =
    mimeType === "image/webp" &&
    bytes.toString("ascii", 0, 4) === "RIFF" &&
    bytes.toString("ascii", 8, 12) === "WEBP";

  if (!isJpeg && !isPng && !isWebp) return null;

  return {
    mimeType: mimeType as ParsedImage["mimeType"],
    bytes,
  };
}

function toDishPhotoResponse(photo: typeof dishPhotosTable.$inferSelect) {
  return CreateDishPhotoResponse.parse({
    id: photo.id,
    title: photo.title,
    caption: photo.caption,
    mimeType: photo.mimeType,
    inspectorNote: photo.inspectorNote,
    createdAt: photo.createdAt.toISOString(),
    imageUrl: `/api/dishes/${photo.id}/image`,
  });
}

router.get("/dishes", async (_req, res): Promise<void> => {
  const photos = await db
    .select({
      id: dishPhotosTable.id,
      title: dishPhotosTable.title,
      caption: dishPhotosTable.caption,
      mimeType: dishPhotosTable.mimeType,
      inspectorNote: dishPhotosTable.inspectorNote,
      createdAt: dishPhotosTable.createdAt,
    })
    .from(dishPhotosTable)
    .orderBy(desc(dishPhotosTable.createdAt), desc(dishPhotosTable.id));

  res.json(ListDishPhotosResponse.parse(photos.map((photo) => ({
    ...photo,
    createdAt: photo.createdAt.toISOString(),
    imageUrl: `/api/dishes/${photo.id}/image`,
  }))));
});

router.post("/dishes", async (req, res): Promise<void> => {
  const parsed = CreateDishPhotoBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({
      error: "Add a title and choose a JPEG, PNG, or WebP photo no larger than 3 MB.",
    });
    return;
  }

  const title = parsed.data.title.trim();
  if (!title) {
    res.status(400).json({ error: "Add a title for the dish photo." });
    return;
  }

  const image = parseImageDataUrl(parsed.data.image);
  if (!image) {
    res.status(400).json({
      error: "Choose a valid JPEG, PNG, or WebP photo no larger than 3 MB.",
    });
    return;
  }

  let inspection;
  try {
    inspection = await inspectDishPhoto(parsed.data.image);
  } catch (err) {
    req.log.error({ err }, "Dish photo inspection failed");
    res.status(502).json({
      error: "The dish inspector is unavailable right now. Please try again shortly.",
    });
    return;
  }

  if (!inspection.isMatch || inspection.confidence < 0.7) {
    res.status(422).json({
      error: `Only ${CITY_SETTINGS.favoriteDish} photos can be uploaded!`,
      reason: `The inspector saw: ${inspection.whatISee}`,
    });
    return;
  }

  const [photo] = await db
    .insert(dishPhotosTable)
    .values({
      title,
      caption: parsed.data.caption?.trim() ?? "",
      mimeType: image.mimeType,
      imageBase64: image.bytes.toString("base64"),
      inspectorNote: `Inspector: looks like ${CITY_SETTINGS.favoriteDish} (${Math.round(inspection.confidence * 100)}% sure)`,
    })
    .returning();

  res.status(201).json(toDishPhotoResponse(photo));
});

router.get("/dishes/:id/image", async (req, res): Promise<void> => {
  const params = GetDishPhotoImageParams.safeParse(req.params);
  if (!params.success) {
    res.status(404).json({ error: "Dish photo not found." });
    return;
  }

  const [photo] = await db
    .select({
      mimeType: dishPhotosTable.mimeType,
      imageBase64: dishPhotosTable.imageBase64,
    })
    .from(dishPhotosTable)
    .where(eq(dishPhotosTable.id, params.data.id));

  if (!photo) {
    res.status(404).json({ error: "Dish photo not found." });
    return;
  }

  res.setHeader("Content-Type", photo.mimeType);
  res.setHeader("Cache-Control", "public, max-age=3600");
  res.end(Buffer.from(photo.imageBase64, "base64"));
});

export default router;
