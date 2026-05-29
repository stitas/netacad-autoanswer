function findQuestionTextElement(questionViewElement) {
  if (!questionViewElement || !questionViewElement.shadowRoot) return null;

  const baseView = questionViewElement.shadowRoot.querySelector(
    'base-view[type="component"]'
  );
  const searchRoot = baseView?.shadowRoot || questionViewElement.shadowRoot;

  const specificQuestionElement =
    searchRoot.querySelector("div.component__body-inner.mcq__body-inner") ||
    searchRoot.querySelector(
      "div.component__body-inner.objectMatching__body-inner"
    ) ||
    searchRoot.querySelector("div.component__body-inner") ||
    searchRoot.querySelector(".mcq__prompt") ||
    searchRoot.querySelector(".objectMatching__prompt") ||
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

async function buildQuestionContext(questionText, questionTextElement) {
  const { imageAltTexts, imageDataUrls } =
    await getQuestionImageContext(questionTextElement);
  const questionContext =
    imageAltTexts.length > 0
      ? `${questionText}\n\nImage descriptions:\n${imageAltTexts
          .map((altText) => `- ${altText}`)
          .join("\n")}`
      : questionText;

  return { questionContext, imageDataUrls };
}

function processAnswerElements(answerElements) {
  return Array.from(answerElements).map((answer) =>
    getAnswerTitleFromLabel(answer)
  );
}

function getItemTextFromButton(buttonElement) {
  if (!buttonElement) return "";

  const textElement = buttonElement.querySelector(".category-item-text");
  return (textElement || buttonElement).innerText.replace(/\s+/g, " ").trim();
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

function findMatchingItemByText(items, targetText) {
  const normalizedTargetText = normalizeAnswerTitle(targetText);
  return items.find(
    (item) => normalizeAnswerTitle(item.text) === normalizedTargetText
  );
}

function activateElement(element) {
  if (!element) return;

  const mouseEventOptions = {
    bubbles: true,
    cancelable: true,
    composed: true,
    view: window,
    button: 0,
  };
  const pointerEventOptions = {
    ...mouseEventOptions,
    pointerId: 1,
    pointerType: "mouse",
    isPrimary: true,
  };

  if (typeof PointerEvent === "function") {
    element.dispatchEvent(new PointerEvent("pointerdown", pointerEventOptions));
  }
  element.dispatchEvent(new MouseEvent("mousedown", mouseEventOptions));
  if (typeof PointerEvent === "function") {
    element.dispatchEvent(new PointerEvent("pointerup", pointerEventOptions));
  }
  element.dispatchEvent(new MouseEvent("mouseup", mouseEventOptions));
  element.click();
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

    activateElement(answerLabel);
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

  const { questionContext, imageDataUrls } = await buildQuestionContext(
    questionText,
    questionTextElement
  );

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

function extractMatchingQuestion(objectMatchingViewElement) {
  let questionText = "Question text not found";
  let questionTextElement = null;
  let categories = [];
  let options = [];

  try {
    if (objectMatchingViewElement && objectMatchingViewElement.shadowRoot) {
      questionTextElement = findQuestionTextElement(objectMatchingViewElement);
      if (questionTextElement) questionText = questionTextElement.innerText.trim();

      categories = Array.from(
        objectMatchingViewElement.shadowRoot.querySelectorAll(
          ".objectMatching-category-item",
        ),
      )
        .map((button) => ({
          text: getItemTextFromButton(button),
          button: button,
        }))
        .filter((item) => item.text);

      options = Array.from(
        objectMatchingViewElement.shadowRoot.querySelectorAll(
          ".objectMatching-option-item",
        ),
      )
        .map((button) => ({
          text: getItemTextFromButton(button),
          button: button,
        }))
        .filter((item) => item.text);
    } else {
      questionText = "Error: Matching View element not accessible.";
    }
  } catch (e) {
    questionText = "Error extracting data.";
  }

  return { questionText, questionTextElement, categories, options };
}

function parseMatchingAiResponse(rawAiResponse) {
  const trimmedResponse = rawAiResponse.trim();
  const jsonText = trimmedResponse
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "");
  const embeddedJsonText =
    jsonText.match(/\[[\s\S]*\]/)?.[0] ||
    jsonText.match(/\{[\s\S]*\}/)?.[0] ||
    jsonText;

  try {
    const parsedResponse = JSON.parse(embeddedJsonText);

    if (Array.isArray(parsedResponse)) {
      return parsedResponse
        .filter((item) => item && item.category && item.option)
        .map((item) => ({
          category: String(item.category).trim(),
          option: String(item.option).trim(),
        }));
    }

    if (parsedResponse && typeof parsedResponse === "object") {
      return Object.entries(parsedResponse).map(([category, option]) => ({
        category: String(category).trim(),
        option: String(option).trim(),
      }));
    }
  } catch (e) {
  }

  return [];
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function matchCategoryToOption(categoryButton, optionButton) {
  activateElement(categoryButton);
  await delay(75);
  activateElement(optionButton);
  await delay(75);
}

async function processMatchingQuestion(objectMatchingViewElement, apiKey) {
  const { questionText, questionTextElement, categories, options } =
    extractMatchingQuestion(objectMatchingViewElement);

  if (
    !apiKey ||
    !questionText ||
    questionText.startsWith("Error") ||
    categories.length === 0 ||
    options.length === 0
  ) {
    return false;
  }

  const { questionContext, imageDataUrls } = await buildQuestionContext(
    questionText,
    questionTextElement
  );

  const rawAiResponse = await getAiMatchingAnswer(
    questionContext,
    categories.map((category) => category.text),
    options.map((option) => option.text),
    apiKey,
    imageDataUrls,
  );
  const matchingPairs = parseMatchingAiResponse(rawAiResponse);

  for (const pair of matchingPairs) {
    const category = findMatchingItemByText(categories, pair.category);
    const option = findMatchingItemByText(options, pair.option);

    if (category && option) {
      await matchCategoryToOption(category.button, option.button);
    }
  }

  return matchingPairs.length > 0;
}

async function processQuestionView(questionViewElement, apiKey) {
  const tagName = questionViewElement?.tagName?.toLowerCase();

  if (tagName === "mcq-view") {
    return processSingleQuestion(questionViewElement, apiKey);
  }

  if (tagName === "object-matching-view") {
    return processMatchingQuestion(questionViewElement, apiKey);
  }

  return false;
}
