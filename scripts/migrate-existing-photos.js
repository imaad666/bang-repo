require("dotenv").config();
const fs = require("fs");
const path = require("path");
const cloudinary = require("../lib/cloudinary");

const MONTH_MAP = {
  Jan: 0,
  Feb: 1,
  Mar: 2,
  Apr: 3,
  May: 4,
  Jun: 5,
  Jul: 6,
  Aug: 7,
  Sep: 8,
  Oct: 9,
  Nov: 10,
  Dec: 11,
};

const photos = [
  {
    src: "./pics/orchidpark_hoskote_10dec20201.jpeg",
    title: "Orchid Park",
    location: "Hoskote",
    dateLabel: "10 Dec 2021",
    note: "",
  },
  {
    src: "./pics/Channsandra-Whitefield_24dec2021.jpeg",
    title: "Channsandra",
    location: "Whitefield",
    dateLabel: "24 Dec 2021",
    note: "",
  },
  {
    src: "./pics/phoenixmarketcity_24dec2021.jpeg",
    title: "Phoenix Marketcity",
    location: "Whitefield",
    dateLabel: "24 Dec 2021",
    note: "",
  },
  {
    src: "./pics/sumadhuratower-hopefarm_26dec2021.jpeg",
    title: "Sumadhura Tower",
    location: "Hope Farm",
    dateLabel: "26 Dec 2021",
    note: "",
  },
  {
    src: "./pics/channsandra_6mar2022.jpeg",
    title: "Channsandra",
    location: "Whitefield",
    dateLabel: "6 Mar 2022",
    note: "",
  },
  {
    src: "./pics/krishnagiri_shoolagiri_6mar2022.jpeg",
    title: "Krishnagiri",
    location: "Shoolagiri",
    dateLabel: "6 Mar 2022",
    note: "",
  },
  {
    src: "./pics/channasandra_25mar2022.jpeg",
    title: "Channasandra",
    location: "Whitefield",
    dateLabel: "25 Mar 2022",
    note: "",
  },
  {
    src: "./pics/hebbal_kempapura_24apr2022.jpeg",
    title: "Hebbal",
    location: "Kempapura",
    dateLabel: "24 Apr 2022",
    note: "",
  },
  {
    src: "./pics/HopeFarm_14jul2022.jpeg",
    title: "Hope Farm",
    location: "Whitefield",
    dateLabel: "14 Jul 2022",
    note: "",
  },
  {
    src: "./pics/kadugodi_06may2023.jpeg",
    title: "Kadugodi",
    location: "Whitefield",
    dateLabel: "6 May 2023",
    note: "",
  },
  {
    src: "./pics/kadugodi_23may2023.jpeg",
    title: "Kadugodi",
    location: "Whitefield",
    dateLabel: "23 May 2023",
    note: "",
  },
  {
    src: "./pics/T2-24sep2025.jpeg",
    title: "Terminal 2",
    location: "KIA",
    dateLabel: "24 Sep 2025",
    note: "",
  },
  {
    src: "./pics/wilson-garden_11oct2025.jpeg",
    title: "Wilson Garden",
    location: "Bangalore",
    dateLabel: "11 Oct 2025",
    note: "",
  },
  {
    src: "./pics/BYOC_Indiranagar_7dec2025.jpeg",
    title: "BYOC",
    location: "Indiranagar",
    dateLabel: "7 Dec 2025",
    note: "",
  },
];

function dateLabelToIso(label) {
  const [day, monthName, year] = label.split(" ");
  const month = MONTH_MAP[monthName];
  if (month === undefined) throw new Error(`Unknown month in "${label}"`);
  return new Date(Date.UTC(Number(year), month, Number(day))).toISOString();
}

function escapeContextValue(value) {
  return String(value ?? "").replace(/\\/g, "\\\\").replace(/\|/g, "\\|").replace(/=/g, "\\=");
}

function buildContextString(fields) {
  return Object.entries(fields)
    .filter(([, value]) => value !== undefined && value !== null && value !== "")
    .map(([key, value]) => `${key}=${escapeContextValue(value)}`)
    .join("|");
}

async function main() {
  for (const photo of photos) {
    const filePath = path.join(__dirname, "..", photo.src.replace("./", ""));
    if (!fs.existsSync(filePath)) {
      console.warn(`Skipping "${photo.src}": file not found`);
      continue;
    }

    const context = buildContextString({
      title: photo.title,
      date_taken: dateLabelToIso(photo.dateLabel),
      location: photo.location,
      note: photo.note,
    });

    console.log(`Uploading ${path.basename(filePath)}...`);
    const result = await cloudinary.uploader.upload(filePath, {
      tags: "bang-photo",
      context,
    });
    console.log(`  -> ${result.public_id}`);
  }

  console.log("Done.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
