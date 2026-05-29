// Constants for retry mechanism
const MAX_SCRAPE_ATTEMPTS = 10;
const SCRAPE_RETRY_DELAY_MS = 1500;

function getVisibleArea(element) {
  if (!element || typeof element.getBoundingClientRect !== "function") return 0;

  const rect = element.getBoundingClientRect();
  const visibleWidth =
    Math.min(rect.right, window.innerWidth) - Math.max(rect.left, 0);
  const visibleHeight =
    Math.min(rect.bottom, window.innerHeight) - Math.max(rect.top, 0);

  return Math.max(0, visibleWidth) * Math.max(0, visibleHeight);
}

function isElementDisplayedInComposedTree(element) {
  let currentElement = element;

  while (currentElement) {
    if (currentElement.nodeType !== Node.ELEMENT_NODE) return true;

    const style = window.getComputedStyle(currentElement);
    if (
      style.display === "none" ||
      style.visibility === "hidden" ||
      currentElement.hidden ||
      currentElement.getAttribute("aria-hidden") === "true"
    ) {
      return false;
    }

    if (currentElement.parentElement) {
      currentElement = currentElement.parentElement;
      continue;
    }

    const rootNode = currentElement.getRootNode();
    currentElement = rootNode instanceof ShadowRoot ? rootNode.host : null;
  }

  return true;
}

function getCurrentQuestionViewElement(questionViewElements) {
  const visibleQuestionViews = questionViewElements
    .map((questionView) => ({
      element: questionView,
      visibleArea: getVisibleArea(questionView),
    }))
    .filter(
      ({ element, visibleArea }) =>
        visibleArea > 0 && isElementDisplayedInComposedTree(element),
    )
    .sort((a, b) => b.visibleArea - a.visibleArea);

  if (visibleQuestionViews.length === 0) return null;

  return visibleQuestionViews[0].element;
}

function findQuestionViewElements() {
  const questionViewElements = [];

  const appRoot = document.querySelector("app-root");
  const pageView = appRoot?.shadowRoot?.querySelector("page-view");
  if (!pageView?.shadowRoot) {
    return questionViewElements;
  }

  pageView.shadowRoot
    .querySelectorAll("article-view")
    .forEach((articleView) => {
      articleView.shadowRoot
        ?.querySelectorAll("block-view")
        .forEach((blockView) => {
          const questionView = blockView.shadowRoot?.querySelector(
            "mcq-view, object-matching-view"
          );
          if (questionView) questionViewElements.push(questionView);
        });
    });

  return questionViewElements;
}

async function scrapeData(currentAttempt = 1) {
  const storedData = await chrome.storage.sync.get(["aiApiKey"]);
  const apiKey = storedData.aiApiKey;
  const currentQuestionViewElement = getCurrentQuestionViewElement(
    findQuestionViewElements()
  );

  if (!currentQuestionViewElement) {
    if (currentAttempt < MAX_SCRAPE_ATTEMPTS) {
      setTimeout(() => {
        window.scrapeData && window.scrapeData(currentAttempt + 1);
      }, SCRAPE_RETRY_DELAY_MS);
      return false;
    }
    return false;
  }

  if (!apiKey) {
    return false;
  }

  return processQuestionView(currentQuestionViewElement, apiKey);
} 
