// Keep the visitor's small list in memory only; it disappears on refresh.
const likesForm = document.querySelector("#likes-form");
const likeInput = document.querySelector("#like-input");
const likesList = document.querySelector("#likes-list");
const formNote = document.querySelector("#form-note");
const birdButton = document.querySelector(".bird-button");
const birdImage = document.querySelector(".bird");

const likes = [];

likesForm.addEventListener("submit", (event) => {
  event.preventDefault();

  const favorite = likeInput.value.trim();
  if (!favorite) {
    formNote.textContent = "Add a word or two first.";
    likeInput.focus();
    return;
  }

  likes.push(favorite);
  const item = document.createElement("li");
  item.textContent = likes[likes.length - 1];
  likesList.appendChild(item);

  likeInput.value = "";
  formNote.textContent = "Added to your Birmingham list.";
  likeInput.focus();
});

// The bird picture sits inside a real button, so the flutter works for both
// pointer clicks and keyboard activation.
birdButton.addEventListener("click", () => {
  birdImage.classList.remove("shake");
  void birdImage.offsetWidth;
  birdImage.classList.add("shake");
});

// Remove the temporary class when the CSS motion finishes, including when
// reduced-motion preferences make the animation nearly instantaneous.
birdImage.addEventListener("animationend", () => {
  birdImage.classList.remove("shake");
});

// A fallback ensures the shake class never lingers if animation events fail.
birdButton.addEventListener("click", () => {
  window.setTimeout(() => birdImage.classList.remove("shake"), 700);
});

// Dish photos are kept on the server, so they remain in the gallery after reloads.
const MAX_DISH_IMAGE_BYTES = 3 * 1024 * 1024;
const MAX_DISH_IMAGE_DIMENSION = 1280;
const dishUploadForm = document.querySelector("#dish-upload-form");
const dishTitleInput = document.querySelector("#dish-title");
const dishCaptionInput = document.querySelector("#dish-caption");
const dishImageInput = document.querySelector("#dish-image");
const dishSubmitButton = document.querySelector("#dish-submit");
const dishUploadStatus = document.querySelector("#dish-upload-status");
const dishGalleryStatus = document.querySelector("#dish-gallery-status");
const dishGalleryGrid = document.querySelector("#dish-gallery-grid");

function dishPhotoCard(photo) {
  const card = document.createElement("article");
  card.className = "dish-card";

  const image = document.createElement("img");
  image.className = "dish-card-image";
  image.src = photo.imageUrl;
  image.alt = `Photo of ${photo.title}`;
  image.loading = "lazy";
  image.decoding = "async";
  card.appendChild(image);

  const copy = document.createElement("div");
  copy.className = "dish-card-copy";

  const title = document.createElement("h3");
  title.textContent = photo.title;
  copy.appendChild(title);

  if (photo.caption) {
    const caption = document.createElement("p");
    caption.textContent = photo.caption;
    copy.appendChild(caption);
  }

  const date = document.createElement("time");
  date.className = "dish-card-date";
  date.dateTime = photo.createdAt;
  const parsedDate = new Date(photo.createdAt);
  date.textContent = Number.isNaN(parsedDate.getTime())
    ? "Recently shared"
    : parsedDate.toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
        year: "numeric",
      });
  copy.appendChild(date);
  card.appendChild(copy);
  return card;
}

async function loadDishGallery() {
  try {
    const response = await fetch("/api/dishes");
    const photos = await response.json();
    if (!response.ok || !Array.isArray(photos)) {
      throw new Error(photos.error || "The dish gallery could not be loaded.");
    }

    dishGalleryGrid.replaceChildren(...photos.map(dishPhotoCard));
    dishGalleryStatus.textContent = photos.length
      ? `${photos.length} ${photos.length === 1 ? "dish photo" : "dish photos"} shared`
      : "No photos yet. Add the first Birmingham favorite.";
  } catch {
    dishGalleryStatus.textContent = "The dish gallery could not be loaded. Please refresh to try again.";
  }
}

function readBlobAsDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener("load", () => resolve(reader.result));
    reader.addEventListener("error", () => reject(new Error("The photo could not be read.")));
    reader.readAsDataURL(blob);
  });
}

async function resizeDishPhoto(file) {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(
    1,
    MAX_DISH_IMAGE_DIMENSION / Math.max(bitmap.width, bitmap.height),
  );
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));

  const context = canvas.getContext("2d");
  if (!context) {
    bitmap.close();
    throw new Error("This browser could not prepare the photo.");
  }

  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();

  const resizedBlob = await new Promise((resolve) => {
    canvas.toBlob(resolve, file.type, file.type === "image/png" ? undefined : 0.88);
  });
  if (!resizedBlob) {
    throw new Error("This browser could not prepare the photo.");
  }
  if (resizedBlob.size > MAX_DISH_IMAGE_BYTES) {
    throw new Error("The resized photo is still over 3 MB. Choose a smaller image.");
  }

  return readBlobAsDataUrl(resizedBlob);
}

dishUploadForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const title = dishTitleInput.value.trim();
  const caption = dishCaptionInput.value.trim();
  const file = dishImageInput.files[0];

  if (!title) {
    dishUploadStatus.textContent = "Add a name for your dish first.";
    dishTitleInput.focus();
    return;
  }
  if (!file) {
    dishUploadStatus.textContent = "Choose a photo to upload.";
    dishImageInput.focus();
    return;
  }
  if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
    dishUploadStatus.textContent = "Choose a JPEG, PNG, or WebP photo. GIFs are not supported.";
    dishImageInput.value = "";
    dishImageInput.focus();
    return;
  }
  if (file.size > MAX_DISH_IMAGE_BYTES) {
    dishUploadStatus.textContent = "This photo is over 3 MB. Choose a smaller JPEG, PNG, or WebP file.";
    dishImageInput.focus();
    return;
  }

  dishSubmitButton.disabled = true;
  dishUploadStatus.textContent = "Preparing and saving your photo…";

  try {
    const image = await resizeDishPhoto(file);
    const response = await fetch("/api/dishes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title, caption, image }),
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(result.error || "The photo could not be saved.");
    }

    dishGalleryGrid.prepend(dishPhotoCard(result));
    const count = dishGalleryGrid.children.length;
    dishGalleryStatus.textContent = `${count} ${count === 1 ? "dish photo" : "dish photos"} shared`;
    dishUploadStatus.textContent = "Your dish is in the gallery.";
    dishUploadForm.reset();
  } catch (error) {
    dishUploadStatus.textContent = error instanceof Error
      ? error.message
      : "The photo could not be saved. Please try again.";
  } finally {
    dishSubmitButton.disabled = false;
  }
});

loadDishGallery();

// Chat messages and their history live only in this page session.
const chatForm = document.querySelector("#chat-form");
const chatInput = document.querySelector("#chat-input");
const chatSubmit = document.querySelector("#chat-submit");
const chatTranscript = document.querySelector("#chat-transcript");
const chatStatus = document.querySelector("#chat-status");
const systemPromptText = document.querySelector("#system-prompt-text");
const promptLoadStatus = document.querySelector("#prompt-load-status");
const temperatureSlider = document.querySelector("#temperature-slider");
const maxTokensSlider = document.querySelector("#max-tokens-slider");
const topPSlider = document.querySelector("#top-p-slider");
const temperatureValue = document.querySelector("#temperature-value");
const maxTokensValue = document.querySelector("#max-tokens-value");
const topPValue = document.querySelector("#top-p-value");

const chatHistory = [];

function getChatSettings() {
  return {
    temperature: Number(temperatureSlider.value),
    topP: Number(topPSlider.value),
    maxOutputTokens: Number(maxTokensSlider.value),
  };
}

function updatePromptSettingLabels() {
  temperatureValue.value = Number(temperatureSlider.value).toFixed(1);
  maxTokensValue.value = maxTokensSlider.value;
  topPValue.value = Number(topPSlider.value).toFixed(2);
}

for (const slider of [temperatureSlider, maxTokensSlider, topPSlider]) {
  slider.addEventListener("input", updatePromptSettingLabels);
}
updatePromptSettingLabels();

function addChatMessage({ role, content, metadata, truncated = false }) {
  const article = document.createElement("article");
  article.className = `chat-message ${role === "user" ? "visitor-message" : "guide-message"}`;

  const speaker = document.createElement("p");
  speaker.className = "message-speaker";
  speaker.textContent = role === "user" ? "YOU" : "YOUR LOCAL GUIDE";
  article.appendChild(speaker);

  const message = document.createElement("p");
  message.className = "message-content";
  message.textContent = content;
  article.appendChild(message);

  if (metadata) {
    const details = document.createElement("p");
    details.className = "answer-details";
    details.textContent =
      `Settings: temperature ${metadata.settings.temperature.toFixed(1)} · ` +
      `top-p ${metadata.settings.topP.toFixed(2)} · ` +
      `max ${metadata.settings.maxOutputTokens} tokens` +
      `  |  Tokens: ${metadata.usage.promptTokens} prompt / ` +
      `${metadata.usage.outputTokens} answer / ${metadata.usage.totalTokens} total` +
      `  |  Model: ${metadata.model}`;
    article.appendChild(details);
  }

  if (truncated) {
    const cutoff = document.createElement("p");
    cutoff.className = "answer-cutoff";
    cutoff.textContent = "This answer was cut off at the output limit. Raise max output tokens and ask again for more detail.";
    article.appendChild(cutoff);
  }

  chatTranscript.appendChild(article);
  article.scrollIntoView({ behavior: "smooth", block: "nearest" });
  return article;
}

async function loadSystemPrompt() {
  try {
    const response = await fetch("/api/chat/system-prompt");
    const data = await response.json();
    if (!response.ok || typeof data.systemPrompt !== "string") {
      throw new Error(data.error || "The prompt could not be loaded.");
    }
    systemPromptText.textContent = data.systemPrompt;
    promptLoadStatus.textContent = "This is the complete prompt sent with each question.";
  } catch {
    systemPromptText.textContent = "The city guide prompt is unavailable right now.";
    promptLoadStatus.textContent = "Could not load the prompt.";
  }
}

loadSystemPrompt();

chatForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  const message = chatInput.value.trim();
  if (!message) {
    chatStatus.textContent = "Type a question first.";
    chatInput.focus();
    return;
  }

  addChatMessage({ role: "user", content: message });
  chatInput.value = "";
  chatSubmit.disabled = true;
  chatStatus.textContent = "Your local guide is thinking…";
  const loadingMessage = addChatMessage({ role: "assistant", content: "One moment while I look that up." });
  loadingMessage.classList.add("loading-message");

  try {
    const response = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message,
        history: chatHistory.slice(-24),
        settings: getChatSettings(),
      }),
    });
    const data = await response.json();
    loadingMessage.remove();

    if (!response.ok) {
      throw new Error(data.error || "The city guide could not answer just now.");
    }

    addChatMessage({
      role: "assistant",
      content: data.reply,
      metadata: {
        settings: data.settings,
        usage: data.usage,
        model: data.model,
      },
      truncated: data.truncated,
    });
    chatHistory.push(
      { role: "user", content: message },
      { role: "assistant", content: data.reply },
    );
    chatStatus.textContent = "Ask another question whenever you’re ready.";
  } catch (error) {
    loadingMessage.remove();
    const errorMessage = error instanceof Error ? error.message : "The city guide could not answer just now.";
    addChatMessage({ role: "assistant", content: errorMessage });
    chatStatus.textContent = errorMessage.includes("GEMINI_API_KEY")
      ? "The AI city guide needs a Gemini API key to answer questions."
      : "Please try again in a moment.";
  } finally {
    chatSubmit.disabled = false;
    chatInput.focus();
  }
});
