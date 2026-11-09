// Every photo on the site: real, openly licensed pictures from Wikimedia Commons.
// The footer lists these credits; each hero photo also shows its own.
export const PHOTOS = {
  sleeperFront: {
    src: "img/sleeper-front.jpg",
    w: 1920,
    small: "img/sleeper-front-960.jpg",
    title: "Vande Bharat Sleeper Express, front view",
    author: "Sameer2905",
    license: "CC BY-SA 4.0",
    licenseUrl: "https://creativecommons.org/licenses/by-sa/4.0/",
    page: "https://commons.wikimedia.org/wiki/File:Vande_Bharat_Sleeper_Express_(Jul_%2726).jpg",
    pos: "40% 55%",
  },
  sleeperYard: {
    src: "img/sleeper-yard.jpg",
    w: 1280,
    small: "img/sleeper-yard-960.jpg",
    title: "Vande Bharat Sleeper rake at SMVT Bengaluru",
    author: "Sameer2905",
    license: "CC BY-SA 4.0",
    licenseUrl: "https://creativecommons.org/licenses/by-sa/4.0/",
    page: "https://commons.wikimedia.org/wiki/File:Vande_Bharat_Sleeper_Express.jpg",
    pos: "30% 50%",
  },
  dudhsagar: {
    src: "img/dudhsagar.jpg",
    w: 1920,
    small: "img/dudhsagar-960.jpg",
    title: "Dudhsagar Falls in the monsoon, with the railway bridge",
    author: "Riyazahammad",
    license: "CC BY-SA 4.0",
    licenseUrl: "https://creativecommons.org/licenses/by-sa/4.0/",
    page: "https://commons.wikimedia.org/wiki/File:Dhoodh_Sagar_falls.jpg",
    pos: "45% 60%",
  },
};

// Hero slideshow, in order.
export const SLIDES = [PHOTOS.sleeperFront, PHOTOS.dudhsagar, PHOTOS.sleeperYard];
// Photo behind every station board.
export const BANNER = PHOTOS.sleeperYard;
// "What Rail Club does" cards.
export const CARDS = { station: PHOTOS.sleeperYard, journey: PHOTOS.dudhsagar, travellers: PHOTOS.sleeperFront };

export const creditLine = (p) => `${p.title} · Photo: ${p.author}, ${p.license}`;
