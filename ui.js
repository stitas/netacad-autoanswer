function findQuestionTextElement(mcqViewElement) {
  if (!mcqViewElement || !mcqViewElement.shadowRoot) return null;

  const baseView = mcqViewElement.shadowRoot.querySelector(
    'base-view[type="component"]'
  );
  const searchRoot = baseView?.shadowRoot || mcqViewElement.shadowRoot;

  const specificQuestionElement =
    searchRoot.querySelector("div.component__body-inner.mcq__body-inner") ||
    searchRoot.querySelector(".mcq__prompt") ||
    searchRoot.querySelector(".prompt");

  if (specificQuestionElement) return specificQuestionElement;

  return Array.from(searchRoot.querySelectorAll("div, p, span")).find(
    (el) => el.innerText.trim().length > 20
  ) || null;
}

function extractQuestionAndAnswers(mcqViewElement) {
  let questionText = "Question text not found";
  let answerElements = [];
  let questionTextElement = null;

  try {
    if (mcqViewElement && mcqViewElement.shadowRoot) {
      questionTextElement = findQuestionTextElement(mcqViewElement);
      if (questionTextElement) questionText = questionTextElement.innerText.trim();

      answerElements = mcqViewElement.shadowRoot.querySelectorAll(
        ".mcq__item-label.js-item-label"
      );
    } else {
      questionText = "Error: MCQ View element not accessible.";
    }
  } catch (e) {
    questionText = `Error extracting data.`;
  }
  return { questionText, answerElements, questionTextElement };
}

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

async function imageElementToDataUrl(imageElement) {
  const source =
    imageElement.currentSrc ||
    imageElement.src ||
    imageElement.getAttribute("src");

  if (!source) return null;
  if (source.startsWith("data:")) return source;

  const imageUrl = new URL(source, document.baseURI).href;
  const response = await fetch(imageUrl);
  if (!response.ok) return null;

  return blobToDataUrl(await response.blob());
}

async function getQuestionImageContext(questionTextElement) {
  const imageAltTexts = [];
  const imageDataUrls = [];

  if (!questionTextElement) {
    return { imageAltTexts, imageDataUrls };
  }

  const imageElements = Array.from(questionTextElement.querySelectorAll("img"));
  for (const imageElement of imageElements) {
    const altText = imageElement.getAttribute("alt")?.trim();

    if (altText) {
      imageAltTexts.push(altText);
      continue;
    }

    try {
      const imageDataUrl = await imageElementToDataUrl(imageElement);
      if (imageDataUrl) imageDataUrls.push(imageDataUrl);
    } catch (e) {
    }
  }

  return { imageAltTexts, imageDataUrls };
}

function processAnswerElements(answerElements) {
  return Array.from(answerElements).map((answer) =>
    getAnswerTitleFromLabel(answer)
  );
}

function getAnswerTitleFromLabel(answerLabel) {
  if (!answerLabel) return "";

  const labelClone = answerLabel.cloneNode(true);
  labelClone
    .querySelectorAll(".screenReader-position-text, .aria-label")
    .forEach((el) => el.remove());

  return labelClone.innerText.replace(/\s+/g, " ").trim();
}

function normalizeAnswerTitle(answerTitle) {
  return String(answerTitle || "").replace(/\s+/g, " ").trim().toLowerCase();
}

function setAnswerCheckboxState(answerTitle, isChecked, mcqViewElement) {
  const normalizedTargetTitle = normalizeAnswerTitle(answerTitle);

  if (!normalizedTargetTitle || !mcqViewElement || !mcqViewElement.shadowRoot) {
    return false;
  }

  const answerLabels = mcqViewElement.shadowRoot.querySelectorAll(
    ".mcq__item-label.js-item-label",
  );

  for (const answerLabel of answerLabels) {
    const currentTitle = getAnswerTitleFromLabel(answerLabel);
    if (normalizeAnswerTitle(currentTitle) !== normalizedTargetTitle) continue;

    const inputId = answerLabel.getAttribute("for");
    const answerInput = inputId
      ? mcqViewElement.shadowRoot.getElementById(inputId)
      : answerLabel.parentElement?.querySelector(".mcq__item-input");
    const isLabelSelected = answerLabel.classList.contains("is-selected");
    const isInputChecked = Boolean(answerInput && answerInput.checked);
    const isCurrentlyChecked = isChecked
      ? isLabelSelected
      : isLabelSelected || isInputChecked;

    if (isCurrentlyChecked === Boolean(isChecked)) {
      return true;
    }

    answerLabel.click();
    return true;
  }

  return false;
}

async function processSingleQuestion(mcqViewElement, apiKey) {
  const { questionText, answerElements, questionTextElement } =
    extractQuestionAndAnswers(mcqViewElement);

  const answerTexts = processAnswerElements(answerElements);
  if (
    !apiKey ||
    !questionText ||
    questionText.startsWith("Error") ||
    answerTexts.length === 0
  ) {
    return false;
  }

  const { imageAltTexts, imageDataUrls } =
    await getQuestionImageContext(questionTextElement);
  const questionContext =
    imageAltTexts.length > 0
      ? `${questionText}\n\nImage descriptions:\n${imageAltTexts
          .map((altText) => `- ${altText}`)
          .join("\n")}`
      : questionText;

  const rawAiResponse = await getAiAnswer(
    questionContext,
    answerTexts,
    apiKey,
    imageDataUrls
  );
  const individualAnswers = rawAiResponse
    .split("\n")
    .map((ans) => ans.trim())
    .filter((ans) => ans.length > 0);
  individualAnswers.forEach((answer) =>
    setAnswerCheckboxState(answer, true, mcqViewElement)
  );
  
  return true;
}
