("use strict");

const axios = require("axios");
const cheerio = require("cheerio");
require("dotenv").config();
const CronJob = require("cron").CronJob;
const { Configuration, OpenAIApi } = require("openai");
const configuration = new Configuration({
  apiKey: process.env.OPENAI,
});
const openai = new OpenAIApi(configuration);

//unsplash
const API_ACCESS_KEY = process.env.UNSPLASH_API;
const BASE_URL = process.env.UNSPLASH_URL;

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
    console.log("generating...");
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
const job = new CronJob(
  "0 7,13,19,23 * * *",
  () => {
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
  },
  null,
  true,
  "Africa/Lagos"
);
module.exports = job;
