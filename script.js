// Sample cards, used the first time the app opens
const sampleCards = [
  { question: "What does CPU stand for?", answer: "Central Processing Unit" },
  { question: "What does HTML stand for?", answer: "HyperText Markup Language" },
  { question: "What does CSS stand for?", answer: "Cascading Style Sheets" },
  { question: "Which language adds interactivity to a web page?", answer: "JavaScript" },
  { question: "What does RAM stand for?", answer: "Random Access Memory" }
];

const maxGenerated = 40;

// Words that should not be chosen as the blanked-out word
const stopWords = [
  "about", "above", "after", "again", "against", "also", "always", "another",
  "because", "become", "becomes", "before", "being", "between", "called",
  "could", "different", "during", "every", "first", "following", "known",
  "later", "making", "might", "often", "other", "others", "should", "since",
  "still", "their", "there", "these", "those", "through", "under", "until",
  "usually", "using", "where", "which", "while", "would"
];

// Words that cannot start a term (they usually mean the sentence is not a definition)
const badStarts = /^(it|this|that|there|these|those|they|he|she|we|you|i|which|what|who|when|where|how|if|but|and|so|also|then|however)\b/i;

// Page elements
const notesFile = document.getElementById("notes-file");
const notesInput = document.getElementById("notes-input");
const modeSelect = document.getElementById("mode-select");
const replaceCheck = document.getElementById("replace-check");
const generateBtn = document.getElementById("generate-btn");
const generateMessage = document.getElementById("generate-message");
const studySection = document.getElementById("study-section");
const cardForm = document.getElementById("card-form");
const questionInput = document.getElementById("question-input");
const answerInput = document.getElementById("answer-input");
const formMessage = document.getElementById("form-message");
const cardCounter = document.getElementById("card-counter");
const flashcard = document.getElementById("flashcard");
const cardQuestion = document.getElementById("card-question");
const cardAnswer = document.getElementById("card-answer");
const prevBtn = document.getElementById("prev-btn");
const flipBtn = document.getElementById("flip-btn");
const nextBtn = document.getElementById("next-btn");
const shuffleBtn = document.getElementById("shuffle-btn");
const deleteBtn = document.getElementById("delete-btn");
const resetBtn = document.getElementById("reset-btn");

let cards = sampleCards.slice();
let index = 0;

// Load saved cards, if any
try {
  const saved = JSON.parse(localStorage.getItem("flashcards"));
  if (Array.isArray(saved)) {
    cards = saved.filter(function (card) {
      return card && typeof card.question === "string" && typeof card.answer === "string";
    });
  }
} catch (error) {
  cards = sampleCards.slice();
}

function saveCards() {
  try {
    localStorage.setItem("flashcards", JSON.stringify(cards));
  } catch (error) {
    // Saving is optional, so ignore errors
  }
}

function setMessage(element, text, isOk) {
  element.textContent = text;
  element.className = isOk ? "message ok" : "message";
}

/* ---------- Turning notes into cards ---------- */

// Remove bullets and numbering from the start of a line
function cleanLine(line) {
  return line.replace(/^\s*(?:[-*\u2022]+|\d+[.)])\s*/, "").trim();
}

// Split notes into sentences (each line is handled separately)
function getSentences(text) {
  const sentences = [];
  text.split(/\n+/).forEach(function (line) {
    const cleaned = cleanLine(line);
    if (cleaned === "") return;
    const parts = cleaned.match(/[^.!?]+(?:[.!?]+|$)/g) || [];
    parts.forEach(function (part) {
      const sentence = part.trim();
      if (sentence.length > 0) sentences.push(sentence);
    });
  });
  return sentences;
}

function validTerm(term) {
  const trimmed = term.trim();
  const words = trimmed.split(/\s+/);
  return trimmed.length >= 2 &&
    words.length <= 6 &&
    trimmed.indexOf(",") === -1 &&
    !badStarts.test(trimmed);
}

// Make the answer look neat: no final full stop, capital first letter
function tidy(text) {
  const trimmed = text.trim().replace(/[.!?]+$/, "").trim();
  return trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
}

// "The CPU" becomes "the CPU" inside a question
function questionTerm(term) {
  return term.trim().replace(/^(The|A|An)\b/, function (word) {
    return word.toLowerCase();
  });
}

// Try to read a sentence as a definition. Returns a card, or null.
function makeDefinitionCard(sentence) {
  let match;

  // Term: meaning
  match = sentence.match(/^([^:]{2,60}):\s*(.{5,})$/);
  if (match && validTerm(match[1])) {
    return {
      question: "What is " + questionTerm(match[1]) + "?",
      answer: tidy(match[2])
    };
  }

  // Term stands for ...
  match = sentence.match(/^(.{2,60}?)\s+stands for\s+(.{3,})$/i);
  if (match && validTerm(match[1])) {
    return {
      question: "What does " + questionTerm(match[1]) + " stand for?",
      answer: tidy(match[2])
    };
  }

  // Term means ... / Term refers to ...
  match = sentence.match(/^(.{2,60}?)\s+(?:means|refers to)\s+(.{5,})$/i);
  if (match && validTerm(match[1])) {
    return {
      question: "What does " + questionTerm(match[1]) + " mean?",
      answer: tidy(match[2])
    };
  }

  // Term is ... / Terms are ...
  match = sentence.match(/^(.{2,60}?)\s+(is|are)\s+(?:defined as\s+)?(.{8,})$/i);
  if (match && validTerm(match[1])) {
    return {
      question: "What " + match[2].toLowerCase() + " " + questionTerm(match[1]) + "?",
      answer: tidy(match[3])
    };
  }

  // Term - meaning
  match = sentence.match(/^(.{2,50}?)\s+[-\u2013\u2014]\s+(.{8,})$/);
  if (match && validTerm(match[1])) {
    return {
      question: "What is " + questionTerm(match[1]) + "?",
      answer: tidy(match[2])
    };
  }

  return null;
}

// Blank out the longest useful word in a sentence. Returns a card, or null.
function makeBlankCard(sentence) {
  const rawWords = sentence.split(/\s+/);
  if (rawWords.length < 6 || rawWords.length > 35) return null;

  let best = "";
  rawWords.forEach(function (raw) {
    const clean = raw.replace(/^[^A-Za-z0-9]+|[^A-Za-z0-9]+$/g, "");
    if (
      /^[A-Za-z]{5,}$/.test(clean) &&
      stopWords.indexOf(clean.toLowerCase()) === -1 &&
      clean.length > best.length
    ) {
      best = clean;
    }
  });

  if (best === "") return null;

  const pattern = new RegExp("\\b" + best + "\\b", "gi");
  const blanked = sentence.replace(pattern, "_____");

  return {
    question: "Fill in the blank: " + blanked,
    answer: best
  };
}

function generateCards(text, mode) {
  const sentences = getSentences(text);
  const result = [];
  const seen = {};

  sentences.forEach(function (sentence) {
    if (result.length >= maxGenerated) return;

    let card = null;
    if (mode === "definitions") {
      card = makeDefinitionCard(sentence);
    } else if (mode === "blanks") {
      card = makeBlankCard(sentence);
    } else {
      card = makeDefinitionCard(sentence) || makeBlankCard(sentence);
    }

    if (card) {
      const key = card.question.toLowerCase();
      if (!seen[key]) {
        seen[key] = true;
        result.push(card);
      }
    }
  });

  return result;
}

/* ---------- Showing and moving between cards ---------- */

function render() {
  const hasCards = cards.length > 0;

  if (hasCards) {
    cardQuestion.textContent = cards[index].question;
    cardAnswer.textContent = cards[index].answer;
    cardCounter.textContent = "Card " + (index + 1) + " of " + cards.length;
  } else {
    cardQuestion.textContent = "No cards yet. Generate or add some above.";
    cardAnswer.textContent = "";
    cardCounter.textContent = "Card 0 of 0";
  }

  prevBtn.disabled = !hasCards;
  nextBtn.disabled = !hasCards;
  flipBtn.disabled = !hasCards;
  shuffleBtn.disabled = !hasCards;
  deleteBtn.disabled = !hasCards;
  flashcard.disabled = !hasCards;
}

// Move to another card, flipping back to the question first
function goTo(newIndex) {
  const wasFlipped = flashcard.classList.contains("flipped");
  flashcard.classList.remove("flipped");
  index = newIndex;

  if (wasFlipped) {
    // Wait for the flip-back so the next answer is not revealed
    setTimeout(render, 300);
  } else {
    render();
  }
}

function flipCard() {
  if (cards.length === 0) return;
  flashcard.classList.toggle("flipped");
}

/* ---------- Events ---------- */

notesFile.addEventListener("change", function () {
  const file = notesFile.files[0];
  if (!file) return;

  const name = file.name.toLowerCase();
  if (!name.endsWith(".txt") && !name.endsWith(".md")) {
    setMessage(generateMessage, "Please upload a .txt file. For Word or PDF notes, copy the text and paste it into the box.", false);
    return;
  }
  if (file.size > 500000) {
    setMessage(generateMessage, "That file is too large. Please use a file under 500 KB.", false);
    return;
  }

  const reader = new FileReader();
  reader.onload = function () {
    notesInput.value = reader.result;
    setMessage(generateMessage, "File loaded. Click Generate Cards.", true);
  };
  reader.onerror = function () {
    setMessage(generateMessage, "Sorry, that file could not be read.", false);
  };
  reader.readAsText(file);
});

generateBtn.addEventListener("click", function () {
  setMessage(generateMessage, "", false);

  const text = notesInput.value.trim();
  if (text.length < 20) {
    setMessage(generateMessage, "Please paste or upload some notes first (at least a sentence or two).", false);
    return;
  }

  const newCards = generateCards(text, modeSelect.value);
  if (newCards.length === 0) {
    setMessage(generateMessage, "No cards could be made from these notes. Try writing lines like 'Term: meaning' or 'X is Y'.", false);
    return;
  }

  let startAt;
  if (replaceCheck.checked) {
    cards = newCards;
    startAt = 0;
  } else {
    startAt = cards.length;
    cards = cards.concat(newCards);
  }

  saveCards();
  goTo(startAt);

  setMessage(
    generateMessage,
    "Made " + newCards.length + " cards. Check them over and delete any that don't make sense.",
    true
  );
  studySection.scrollIntoView({ behavior: "smooth" });
});

cardForm.addEventListener("submit", function (event) {
  event.preventDefault();
  formMessage.textContent = "";

  const question = questionInput.value.trim();
  const answer = answerInput.value.trim();

  if (question === "" || answer === "") {
    formMessage.textContent = "Please fill in both the question and the answer.";
    return;
  }

  cards.push({ question: question, answer: answer });
  saveCards();
  goTo(cards.length - 1);

  cardForm.reset();
  questionInput.focus();
});

flashcard.addEventListener("click", flipCard);
flipBtn.addEventListener("click", flipCard);

nextBtn.addEventListener("click", function () {
  if (cards.length === 0) return;
  goTo((index + 1) % cards.length);
});

prevBtn.addEventListener("click", function () {
  if (cards.length === 0) return;
  goTo((index - 1 + cards.length) % cards.length);
});

shuffleBtn.addEventListener("click", function () {
  // Fisher-Yates shuffle
  for (let i = cards.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const temp = cards[i];
    cards[i] = cards[j];
    cards[j] = temp;
  }
  saveCards();
  goTo(0);
});

deleteBtn.addEventListener("click", function () {
  if (cards.length === 0) return;
  cards.splice(index, 1);
  if (index >= cards.length) {
    index = Math.max(cards.length - 1, 0);
  }
  saveCards();
  goTo(index);
});

resetBtn.addEventListener("click", function () {
  if (confirm("Replace all your cards with the sample cards?")) {
    cards = sampleCards.slice();
    saveCards();
    goTo(0);
  }
});

// Arrow keys move between cards (ignored while typing)
document.addEventListener("keydown", function (event) {
  const tag = event.target.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || cards.length === 0) return;

  if (event.key === "ArrowRight") {
    goTo((index + 1) % cards.length);
  } else if (event.key === "ArrowLeft") {
    goTo((index - 1 + cards.length) % cards.length);
  }
});

render();