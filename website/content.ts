// All of the site's text lives here. Replace these placeholder details with
// your own business and the pages update everywhere on the next build.

export const business = {
  name: "Rideline Cycle Works",
  shortName: "Rideline",
  tagline: "Bike repair and servicing, done while you're at work.",
  intro:
    "Drop your bike off before 9:00, get a fixed quote by text before 11:00, and collect it tuned and road-ready after 17:00. Every job is checked on the stand twice before it leaves.",
  address: ["Hafenstraße 14", "20457 Hamburg"],
  phone: "+49 40 1234 5678",
  email: "hello@rideline.example",
};

export const nav = [
  { href: "#services", label: "Services" },
  { href: "#how", label: "How it works" },
  { href: "#about", label: "About" },
  { href: "#visit", label: "Visit" },
];

// Shown on the workshop ticket in the hero.
export const sampleTicket = {
  job: "Job 0418",
  bike: "Gravel, 11-speed",
  lines: [
    { label: "Tyre pressure", value: "42 psi" },
    { label: "Stem bolts", value: "5 Nm" },
    { label: "Chain wear", value: "0.4 %" },
    { label: "Brake pads", value: "Replaced" },
  ],
  status: "Ready 17:00",
};

export const services = [
  {
    name: "Safety check",
    detail: "Brakes, gears, tyres and bolts checked and adjusted.",
    price: "€35",
  },
  {
    name: "Standard service",
    detail: "Full adjustment, drivetrain clean, wheels trued, torque check.",
    price: "€79",
  },
  {
    name: "Full overhaul",
    detail: "Strip down, deep clean, new cables, bearings serviced.",
    price: "€189",
  },
  {
    name: "Puncture repair",
    detail: "Tube or tubeless, while you wait, parts extra.",
    price: "€15",
  },
  {
    name: "Hydraulic brake bleed",
    detail: "Per brake, fresh fluid, lever feel restored.",
    price: "€29",
  },
  {
    name: "E-bike check",
    detail: "Motor diagnostics, firmware update, battery health report.",
    price: "€59",
  },
];

// A real sequence, so the steps are numbered on the page.
export const steps = [
  {
    title: "Drop off",
    text: "Bring your bike in between 7:30 and 9:00. No appointment needed for a standard service.",
  },
  {
    title: "Get a quote",
    text: "We inspect it on the stand and text you a fixed price before 11:00. Nothing extra without your yes.",
  },
  {
    title: "We fix it",
    text: "A mechanic works through the job sheet, then a second mechanic checks the work.",
  },
  {
    title: "Collect",
    text: "Pick it up from 17:00. You get the job sheet with every torque value and part we used.",
  },
];

export const about = {
  heading: "A small workshop that writes everything down",
  paragraphs: [
    "Rideline started in 2016 with one stand and one mechanic. Today four mechanics service around 40 bikes a week, from commuter bikes and cargo bikes to road and gravel bikes.",
    "We record the torque value, tyre pressure and part number for every job, so the next service starts from facts instead of guesses.",
  ],
  facts: [
    { value: "2016", label: "Opened" },
    { value: "4", label: "Mechanics" },
    { value: "40", label: "Bikes a week" },
  ],
};

export const hours = [
  { day: "Monday – Friday", time: "7:30 – 18:30" },
  { day: "Saturday", time: "9:00 – 14:00" },
  { day: "Sunday", time: "Closed" },
];

export const faq = [
  {
    q: "Do I need an appointment?",
    a: "Not for safety checks, standard services or punctures. For a full overhaul or e-bike diagnostics, call ahead so we can reserve a stand.",
  },
  {
    q: "What if the repair costs more than the quote?",
    a: "We stop and text you first. We never go above the quoted price without your approval.",
  },
  {
    q: "Can you work on e-bikes and cargo bikes?",
    a: "Yes. We service most mid-drive and hub motor systems and have a stand rated for cargo bikes up to 60 kg.",
  },
];
