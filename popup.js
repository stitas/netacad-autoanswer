document.addEventListener("DOMContentLoaded", () => {
  const apiKeyInput = document.getElementById("apiKey");
  const saveKeyButton = document.getElementById("saveKey");
  const statusDiv = document.getElementById("status");

  if (
    !(apiKeyInput instanceof HTMLInputElement) ||
    !(saveKeyButton instanceof HTMLButtonElement) ||
    !statusDiv
  ) {
    return;
  }

  chrome.storage.sync.get(["aiApiKey"], (result) => {
    if (result.aiApiKey) {
      apiKeyInput.value = result.aiApiKey;
      statusDiv.textContent = "API Key loaded.";
    } else {
      statusDiv.textContent = "API Key not set.";
    }
    setTimeout(() => {
      if (
        statusDiv.textContent === "API Key loaded." ||
        statusDiv.textContent === "API Key not set."
      )
        statusDiv.textContent = "";
    }, 2000);
  });

  saveKeyButton.addEventListener("click", () => {
    const apiKey = apiKeyInput.value.trim();
    if (apiKey) {
      chrome.storage.sync.set({ aiApiKey: apiKey }, () => {
        statusDiv.textContent = "API Key saved!";
        setTimeout(() => (statusDiv.textContent = ""), 2000);
      });
    } else {
      statusDiv.textContent = "Please enter an API Key.";
    }
  });
});
