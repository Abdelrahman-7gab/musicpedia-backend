const express = require("express");
const app = express();
const axios = require("axios");
const cors = require("cors");
const Redis = require("redis");
const redisClient = Redis.createClient();
const Expiration = 18000; // 5 hours

const Genius = require("genius-lyrics");
const lyricsClient = new Genius.Client();;

app.use(cors());

// Declare a route
app.get("/search/:type/:query", async (request, reply) => {
  const searchType = request.params.type;
  const qsearchQuery = request.params.query;

  try {
    const searchData = await getOrSetCache(
      "search/" + searchType + "/" + qsearchQuery,
      async () => {
        const response = await axios.get(
          `https://api.deezer.com/search/${searchType}?q=${qsearchQuery}`
        );
        return response.data;
      },
      true
    );

    return reply.send(searchData);
  } catch (err) {
    console.log(err);
  }
});

app.get("/view/:type/:id", async (request, reply) => {
  const viewType = request.params.type;
  const id = request.params.id;

  try {
    const viewData = await getOrSetCache(
      "view/" + viewType + "/" + id,
      async () => {
        const item = await axios.get(
          `https://api.deezer.com/${viewType}/${id}`
        );
        return item.data;
      },
      false
    );

    return reply.send(viewData);
  } catch (err) {
    console.log(err);
  }
});

app.get("/lyrics/:artist/:title", async (request, reply) => {
  const artist = request.params.artist;
  const title = request.params.title;

  try {
    const lyrics = await getOrSetCache(
      "lyrics/" + artist + "/" + title,
      async () => {
        const searches = await lyricsClient.songs.search(artist + " " + title);
        // Pick first one
        const firstSong = searches[0];
        const songLyrics = await firstSong.lyrics();

        return songLyrics;
      },
      false
    );

    return reply.send({
      lyrics: lyrics,
    });
  } catch (err) {
    console.log(err);
    return reply.status(400).send({
      message: "can't find lyrics",
    });
  }
});

app.get("/albums/:artistID", async (request, reply) => {
  const artistID = request.params.artistID;
  try {
    const albums = await getOrSetCache(
      "albums/" + artistID,
      async () => {
        const albums = await axios.get(
          `https://api.deezer.com/artist/${artistID}/albums`
        );
        return albums.data;
      },
      true
    );

    return reply.send(albums);
  } catch (err) {
    console.log(err);
  }
});

//function that checks if the data exists in redis Cache
const getOrSetCache = async (key, cb, expiry) => {
  return new Promise(async (resolve, reject) => {
    const cachedData = await redisClient.get(key);
    if (cachedData) {
      console.log("cache hit", key);
      return resolve(JSON.parse(cachedData));
    } else {
      try {
        const newData = await cb();
        if (expiry) {
          redisClient.setEx(key, Expiration, JSON.stringify(newData));
        } else {
          redisClient.set(key, JSON.stringify(newData));
        }
        console.log("added to cache");
        resolve(newData);
      } catch (err) {
        reject(err);
      }
    }
  });
};

// Run the server!
const start = async () => {
  try {
    const port = process.env.PORT || 3000;
    await app.listen(port);
    await redisClient.connect();
    console.log("app started on port", port);
  } catch (err) {
    console.log(err);
    process.exit(1);
  }
};

start();
