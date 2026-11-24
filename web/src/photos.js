// Every photo on the site: real, openly licensed pictures from Wikimedia Commons.
// The footer's "Photo credits" lists every one of them; the photos themselves carry no caption.
export const PHOTOS = {
  lead: {
    src: "img/batasia-loop.jpg",
    w: 1600,
    small: "img/batasia-loop-960.jpg",
    title: "Darjeeling Himalayan Railway steam train at Batasia Loop",
    author: "DEB ANUTOSH",
    license: "CC BY 2.0",
    licenseUrl: "https://creativecommons.org/licenses/by/2.0/",
    page: "https://commons.wikimedia.org/wiki/File:BATASIA_LOOP.jpg",
    pos: "38% 55%",
  },
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
  chenab: {
    src: "img/chenab.jpg",
    w: 1280,
    small: "img/chenab-960.jpg",
    title: "Chenab rail bridge, Reasi district, Jammu and Kashmir",
    author: "Konkan Railway Corporation Limited",
    license: "GODL-India",
    licenseUrl: "https://www.data.gov.in/Godl",
    page: "https://commons.wikimedia.org/wiki/File:Chenab_Rail_Bridge,_Reasi_district,_Jammu_and_Kashmir,_India.jpg",
    pos: "50% 50%",
  },
  dudhsagarTall: {
    src: "img/dudhsagar-tall.jpg",
    w: 1080,
    small: "img/dudhsagar-tall-720.jpg",
    sw: 720,
    title: "Dudhsagar Falls, Goa",
    author: "Hsp wiki",
    license: "CC BY-SA 4.0",
    licenseUrl: "https://creativecommons.org/licenses/by-sa/4.0/",
    page: "https://commons.wikimedia.org/wiki/File:Doodhsagar_Fall.jpg",
    pos: "50% 40%",
  },
  mumbaiLocal: {
    src: "img/mumbai-local.jpg",
    w: 1280,
    small: "img/mumbai-local-960.jpg",
    title: "Western Railway Medha EMU, a Mumbai local train",
    author: "Anonymousboii",
    license: "CC BY-SA 4.0",
    licenseUrl: "https://creativecommons.org/licenses/by-sa/4.0/",
    page: "https://commons.wikimedia.org/wiki/File:Western-Railway-Medha-EMU.jpg",
    pos: "50% 50%",
  },
  csmt: {
    src: "img/csmt.jpg",
    w: 1280,
    small: "img/csmt-960.jpg",
    title: "Chhatrapati Shivaji Terminus, Mumbai",
    author: "Sailko",
    license: "CC BY 3.0",
    licenseUrl: "https://creativecommons.org/licenses/by/3.0/",
    page: "https://commons.wikimedia.org/wiki/File:Chhatrapati_shivaji_terminus,_esterno_01.jpg",
    pos: "50% 50%",
  },
  matheran: {
    src: "img/matheran.jpg",
    w: 1280,
    small: "img/matheran-960.jpg",
    title: "The toy train to Matheran",
    author: "Nilesh.shintre",
    license: "CC BY-SA 3.0",
    licenseUrl: "https://creativecommons.org/licenses/by-sa/3.0/",
    page: "https://commons.wikimedia.org/wiki/File:Train_to_Matheran.JPG",
    pos: "50% 50%",
  },
  nilgiri: {
    src: "img/nilgiri.jpg",
    w: 1280,
    small: "img/nilgiri-960.jpg",
    title: "Nilgiri Mountain Railway train at Ketti",
    author: "A.M.Hurrell",
    license: "CC BY 2.5",
    licenseUrl: "https://creativecommons.org/licenses/by/2.5/",
    page: "https://commons.wikimedia.org/wiki/File:NMR_train_at_Ketti_05-02-26_75.jpeg",
    pos: "50% 50%",
  },
};

// Home page hero photos, in order (a slow crossfade).
export const SLIDES = [PHOTOS.lead, PHOTOS.chenab, PHOTOS.dudhsagar];
// Photo behind every station board.
export const BANNER = PHOTOS.sleeperYard;
// Famous lines next to the Journey Partner example on the home page.
export const LINES = [
  { p: PHOTOS.dudhsagarTall, name: "Dudhsagar, Goa", cls: "tall" },
  { p: PHOTOS.nilgiri, name: "Nilgiri mountain line" },
  { p: PHOTOS.matheran, name: "Matheran" },
];

// srcset for a photo: the small copy and the full one.
export const srcSet = (p) => `${p.small} ${p.sw || 960}w, ${p.src} ${p.w}w`;

export const creditLine = (p) => `${p.title} · Photo: ${p.author}, ${p.license}`;
