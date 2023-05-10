("use strict");

// Imports dependencies and set up http server
const express = require("express"),
  { urlencoded, json } = require("body-parser"),
  app = express();
const axios = require("axios");
const cheerio = require("cheerio");
require("dotenv").config();
const { CronJob } = require("cron");
const { Configuration, OpenAIApi } = require("openai");
const configuration = new Configuration({
  apiKey: process.env.OPENAI,
});
const openai = new OpenAIApi(configuration);

//unsplash
const API_ACCESS_KEY = process.env.UNSPLASH_API;
const BASE_URL = process.env.UNSPLASH_URL;

// Parse application/x-www-form-urlencoded
app.use(urlencoded({ extended: true }));

// Parse application/json
app.use(json());

// Handles messages events
function handleMessage(sender_psid, received_message) {
  let response;

  // Check if the message contains text
  if (received_message.text) {
    // Create the payload for a basic text message
    response = {
      text: `You sent the message: "${received_message.text}". Now send me an image!`,
    };
  }

  // Sends the response message
  callSendAPI(sender_psid, response);
}

// Handles messaging_postbacks events
function handlePostback(sender_psid, received_postback) {
  console.log("yyyy");
}

// Sends response messages via the Send API
function callSendAPI(sender_psid, response) {
  // Construct the message body
  let request_body = {
    recipient: {
      id: sender_psid,
    },
    message: response,
  };

  // Send the HTTP request to the Messenger Platform
  axios({
    url: "https://graph.facebook.com/v2.6/me/messages",
    headers: {
      Authorization: `Bearer ${process.env.PAGE_ACCESS_TOKEN}`,
    },
    data: request_body,
    method: "POST",
  })
    .then((response) => {
      console.log("message sent!");
    })
    .catch((error) => {
      console.error(`Error occurred while sending message: ${error}`);
    });
}
// Respond with 'Hello World' when a GET request is made to the homepage
app.get("/", function (req, res) {
  res.send("hey there boi");
});

app.get("/webhook", function (req, res) {
  // Parse the query params
  let mode = req.query["hub.mode"];
  let token = req.query["hub.verify_token"];
  let challenge = req.query["hub.challenge"];

  // Check if a token and mode is in the query string of the request
  const verify_token = process.env.VERIFY_TOKEN;
  if (mode && token) {
    // Check the mode and token sent is correct
    if (mode === "subscribe" && token === verify_token) {
      // Respond with the challenge token from the request
      console.log("WEBHOOK_VERIFIED");
      res.status(200).send(challenge);
    } else {
      // Respond with '403 Forbidden' if verify tokens do not match
      res.sendStatus(403);
    }
  }
});

app.post("/webhook", (req, res) => {
  // Parse the request body from the POST
  let body = req.body;

  // Check the webhook event is from a Page subscription
  if (body.object === "page") {
    // Iterate over each entry - there may be multiple if batched
    body.entry.forEach(function (entry) {
      // Gets the body of the webhook event
      let webhook_event = entry.messaging[0];
      console.log(webhook_event);

      // Get the sender PSID
      let sender_psid = webhook_event.sender.id;
      console.log("Sender PSID: " + sender_psid);

      // Check if the event is a message or postback and
      // pass the event to the appropriate handler function
      if (webhook_event.message) {
        handleMessage(sender_psid, webhook_event.message);
      } else if (webhook_event.postback) {
        handlePostback(sender_psid, webhook_event.postback);
      }
    });

    // Return a '200 OK' response to all events
    res.status(200).send("EVENT_RECEIVED");
  } else {
    // Return a '404 Not Found' if event is not from a page subscription
    res.sendStatus(404);
  }
});

let topic;
const GetSearchPhrase = async () => {
  try {
    const topics = [
      "Finance and Investing",
      "Technology and Science",
      "Business development",
      "Business and Entrepreneurship",
      "Tech startup",
      "Health and Wellness and Fitness",
      "personal development",
    ];

    const randomIndex = Math.floor(Math.random() * topics.length);

    // get random topic
    topic = topics[randomIndex];
    console.log(topic);
    const prompt = `Generate one well detailed phrase for this
    keyword: ${topic}`;

    const response = await openai.createChatCompletion({
      model: "gpt-3.5-turbo",
      temperature: 1,
      max_tokens: 2000,
      top_p: 0,
      frequency_penalty: 0,
      presence_penalty: 0,
      stop: ["{}"],
      messages: [
        {
          role: "system",
          content: "You are a helpful assistant that generates search phrase.",
        },
        {
          role: "system",
          content:
            "You are ChatGPT, a large language model trained by OpenAI. Answer as concisely as possible. Knowledge cutoff: {knowledge_cutoff} Current date: {current_date}",
        },

        { role: "user", content: `${prompt}` },
      ],
    });

    return response.data.choices[0].message.content;
  } catch (e) {
    console.log(e);
  }
};

const searchGoogle = async (query) => {
  const apiKey = process.env.GOOGLE;
  const searchEngineId = process.env.ENGINE_ID;
  const url = `https://www.googleapis.com/customsearch/v1?key=${apiKey}&cx=${searchEngineId}&q=${encodeURIComponent(
    query
  )}&num=10`;

  try {
    const response = await axios.get(url);
    const items = response.data.items;
    const urls = items.map((item) => item.link);
    const contents = [];

    const randomIndex = Math.floor(Math.random() * urls.length);

    // get random topic
    const link = urls[randomIndex];
    try {
      console.log("specific link ----------------");
      console.log(link);
      const response = await axios.get(link);
      const $ = cheerio.load(response.data);
      const text = $("p").text().trim();
      const MAX_WORDS = 1500;
      const shortenedText = text.split(" ").slice(0, MAX_WORDS).join(" ");
      contents.push(shortenedText);

      return contents.join("\n\n");
    } catch (error) {
      console.error(`Error fetching content from ${url}: ${error.message}`);
    }

    return;
  } catch (error) {
    console.error(`Error searching Google: ${error.message}`);
    throw error;
  }
};

const Summarize = async (content) => {
  try {
    const prompt = `Create an article consisting of five paragraphs regarding
    the content specified in the following string: "${content}". Make use of
    necessary title and hashtags.`;

    const response = await openai.createChatCompletion({
      model: "gpt-3.5-turbo",
      temperature: 0.8,
      max_tokens: 2000,
      top_p: 0,
      frequency_penalty: 0,
      presence_penalty: 0,
      stop: ["{}"],
      messages: [
        {
          role: "system",
          content:
            "You are Gray peterson, a large language model managed by David uche. Answer as concisely as possible. Knowledge cutoff: {knowledge_cutoff} Current date: {current_date}",
        },

        { role: "user", content: `${prompt}` },
      ],
    });

    return response.data.choices[0].message.content;
  } catch (e) {
    return e.request;
  }
};

//Upload to facebook
const UploadToFacebook = async (article, image) => {
  try {
    const url = "https://graph.facebook.com/100287699733096/photos";
    const data = {
      url: image,
      message: article,
      access_token: process.env.PAGE_ACCESS_TOKEN,
    };

    const response = await axios.post(url, data);
    return response.data;
  } catch (e) {
    console.log(e);
  }
};

//Random images
const searchImages = async (query) => {
  try {
    const response = await axios.get(`${BASE_URL}/search/photos`, {
      headers: {
        Authorization: `Client-ID ${API_ACCESS_KEY}`,
      },
      params: {
        query,
      },
    });
    const images = response.data.results;
    const randomImage = Math.floor(Math.random() * images.length);

    return images[randomImage].urls.full;
  } catch (error) {
    console.error(error);
  }
};

// Runs every day at 7:00AM, 2:00 PM & 5:00 PM
const job = new CronJob("0 7,14,17,23 * * *", () => {
  console.log("This job is triggered each second!");

  GetSearchPhrase()
    .then((phrase) => {
      let stringWithoutQuotes = phrase.substring(1, phrase.length - 1);
      console.log(stringWithoutQuotes);
      searchGoogle(stringWithoutQuotes)
        .then((content) => {
          Summarize(content)
            .then((output) => {
              searchImages(topic).then((results) => {
                console.log(results);
                UploadToFacebook(output, results).then((res) =>
                  console.log(res)
                );
              });
            })
            .catch((error) => console.error(error));
        })
        .catch((error) => console.error(error));
    })
    .catch((error) => console.error(error));
});
job.start();

// listen for requests :)
const port = process.env.PORT;
app.listen(port, () => console.log(`Server started on port ${port}`));
