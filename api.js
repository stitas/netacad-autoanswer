const OPENAI_MODEL = "gpt-4.1-mini";
const API_URL = "https://api.openai.com/v1/responses";

function extractOpenAiResponseText(data) {
  if (typeof data.output_text === "string") {
    return data.output_text.trim();
  }

  if (Array.isArray(data.output)) {
    const textParts = [];
    data.output.forEach((outputItem) => {
      if (!Array.isArray(outputItem.content)) return;

      outputItem.content.forEach((contentItem) => {
        if (typeof contentItem.text === "string") {
          textParts.push(contentItem.text);
        }
      });
    });

    if (textParts.length > 0) {
      return textParts.join("").trim();
    }
  }

  return "";
}

async function callOpenAi(prompt, apiKey, imageDataUrls = []) {
  const input =
    imageDataUrls.length > 0
      ? [
          {
            role: "user",
            content: [
              { type: "input_text", text: prompt },
              ...imageDataUrls.map((imageUrl) => ({
                type: "input_image",
                image_url: imageUrl,
              })),
            ],
          },
        ]
      : prompt;

  const response = await fetch(API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: OPENAI_MODEL,
      input: input,
    }),
  });

  if (!response.ok) {
    let errorData = null;
    try {
      errorData = await response.json();
    } catch (e) {
      errorData = { error: await response.text() };
    }

    return {
      error: `Error calling OpenAI API: ${response.status} ${
        response.statusText
      }. Details: ${JSON.stringify(errorData)}`,
    };
  }

  const data = await response.json();
  const text = extractOpenAiResponseText(data);

  if (!text) {
    return {
      error: "Error: Could not extract answer from OpenAI response structure.",
    };
  }

  return { text };
}

async function getAiMatchingAnswer(
  question,
  categories,
  options,
  apiKey,
  imageDataUrls = [],
) {
  if (!apiKey) {
    return "Error: OpenAI API Key not available. Please set it in the extension popup.";
  }

  let prompt = `Given the following matching question, match each category item to exactly one option item.
Return only valid JSON. Do not include Markdown, explanations, comments, or any extra text.
Return a JSON array of objects in this exact shape:
[{"category":"exact category text","option":"exact option text"}]
Use only category text from the Categories list below.
Use only option text from the Options list below.
Copy category and option text exactly as written.
If image descriptions or images are provided, use them as part of the question context.

Question:
${question}

Categories:
`;
  categories.forEach((category) => {
    prompt += `${category}\n`;
  });

  prompt += "\nOptions:\n";
  options.forEach((option) => {
    prompt += `${option}\n`;
  });

  try {
    const result = await callOpenAi(prompt, apiKey, imageDataUrls);
    return result.error || result.text;
  } catch (error) {
    return "Error connecting to OpenAI API. Check console for details.";
  }
}

async function getAiAnswer(question, answers, apiKey, imageDataUrls = []) {
  if (!apiKey) {
    return "Error: OpenAI API Key not available. Please set it in the extension popup.";
  }

  let prompt = `Given the following multiple-choice question and its possible answers, please choose the best answer(s).
If the question implies multiple correct answers (e.g., 'select all that apply', 'choose N correct options'), return ALL chosen answer texts, each on a new line.
Otherwise, if it's a single-choice question, return only the text of the single best chosen answer option.
Return only answer text that appears in the Possible Answers list below.
Copy the answer text exactly as it is written in the Possible Answers list.
Do not include answer numbers, bullets, prefixes, explanations, punctuation you were not given, or any extra text.
If image descriptions or images are provided, use them as part of the question context.

Question:
${question}

Possible Answers:
`;
  answers.forEach((ans) => {
    prompt += `${ans}\n`;
  });

  try {
    const result = await callOpenAi(prompt, apiKey, imageDataUrls);
    return result.error || result.text;
  } catch (error) {
    return "Error connecting to OpenAI API. Check console for details.";
  }
}
