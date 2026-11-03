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
