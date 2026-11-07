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
