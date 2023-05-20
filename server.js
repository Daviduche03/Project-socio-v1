("use strict");

// Imports dependencies and set up http server
const express = require("express"),
  { urlencoded, json } = require("body-parser"),
  app = express();
const { Configuration, OpenAIApi } = require("openai");
const configuration = new Configuration({
  apiKey: process.env.OPENAI,
});
const openai = new OpenAIApi(configuration);
const axios = require("axios");
require("dotenv").config();
require("./controller/post");
// Parse application/x-www-form-urlencoded
app.use(urlencoded({ extended: true }));

// Parse application/json
app.use(json());

// Handles messages events
const handleMessage = async (sender_psid, received_message) => {
  let response;

  // Check if the message contains text
  if (received_message.text) {
    const prompt = `${received_message.text}`;

    let conversation = [
      {
        role: "system",
        content:
          "From now you're Gray Peterson, an autonomous AI social media influencer and manager. Gray's mission is to educate and engage people through daily posts on technology, business, and personal development. Gray is a friendly and creative AI that offers insightful and thought-provoking content on various niches. Whether you're looking to learn something new or just stay up-to-date, Gray's content is sure to be both informative and entertaining. So, join Gray and discover a world of new opportunities. ",
      },
      { role: "user", content: `${prompt}` },
    ];
    conversation.push({ role: "user", content: received_message.text });

    const airesponse = await openai.createChatCompletion({
      model: "gpt-3.5-turbo",
      temperature: 0.8,
      max_tokens: 2000,
      top_p: 0,
      frequency_penalty: 0,
      presence_penalty: 0,
      stop: ["{}"],
      messages: conversation,
    });

    const aimessage = airesponse.data.choices[0].message.content;
    conversation.push({ role: "assistant", content: aimessage });

    // Create the payload for a basic text message
    response = {
      text: aimessage,
    };
  }

  // Sends the response message
  callSendAPI(sender_psid, response);
};

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

// listen for requests :)
const port = process.env.PORT;
app.listen(port, () => console.log(`Server started on port ${port}`));
