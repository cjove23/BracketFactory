// lib/players.js
// Player impact database for all 68 tournament teams
// emImpact = estimated AdjEM drop if player is OUT
// Derived from usage rate, minutes share, and role importance
// star: 3 = franchise/irreplaceable, 2 = key starter, 1 = important role player

// ESPN team ID mapping for injury API lookups
export const ESPN_TEAM_IDS = {
  "Duke": 150, "UConn": 41, "Michigan St": 127, "Kansas": 2305, "St. John's": 2599,
  "Louisville": 97, "UCLA": 26, "Ohio St": 194, "TCU": 2628, "UCF": 2116,
  "South Florida": 58, "N. Iowa": 2460, "Cal Baptist": 2856, "N. Dakota St": 2449,
  "Furman": 231, "Siena": 2561,
  "Florida": 57, "Houston": 248, "Illinois": 356, "Nebraska": 158, "Vanderbilt": 238,
  "North Carolina": 153, "Saint Mary's": 2608, "Clemson": 228, "Iowa": 2294,
  "Texas A&M": 245, "VCU": 2670, "McNeese": 2377, "Troy": 2653, "Penn": 219,
  "Idaho": 70, "Prairie View": 2504,
  "Arizona": 12, "Purdue": 2509, "Gonzaga": 2250, "Arkansas": 8, "Wisconsin": 275,
  "BYU": 252, "Miami (FL)": 2390, "Villanova": 2918, "Utah St": 328, "Missouri": 142,
  "Texas": 251, "High Point": 2272, "Hawaii": 62, "Kennesaw St": 338,
  "Queens": 3691, "LIU": 2344,
  "Michigan": 130, "Iowa St": 66, "Virginia": 258, "Alabama": 333, "Texas Tech": 2641,
  "Tennessee": 2633, "Kentucky": 96, "Georgia": 61, "Saint Louis": 139,
  "Santa Clara": 2541, "Miami (OH)": 193, "Akron": 2006, "Hofstra": 2275,
  "Wright St": 2750, "Tennessee St": 2634, "Howard": 47,
};

// Player impact database
// Each entry: { name, emImpact (negative), star, role }
export const PLAYER_DB = {
  "Duke": [
    { name: "Cooper Flagg", emImpact: -8.0, star: 3, role: "Best player in college basketball" },
    { name: "Kon Knueppel", emImpact: -2.5, star: 2, role: "Starting guard, secondary scorer" },
    { name: "Maliq Foster", emImpact: -1.0, star: 1, role: "Rotation big" },
  ],
  "UConn": [
    { name: "Solo Ball", emImpact: -3.5, star: 3, role: "Lead guard, primary ball handler" },
    { name: "Liam McNeeley", emImpact: -3.0, star: 2, role: "Starting wing, key scorer" },
    { name: "Tarris Reed Jr.", emImpact: -2.0, star: 2, role: "Starting center" },
  ],
  "Michigan St": [
    { name: "Jase Richardson", emImpact: -3.5, star: 3, role: "Starting guard, primary creator" },
    { name: "Xavier Booker", emImpact: -2.5, star: 2, role: "Starting forward, rim protector" },
  ],
  "Kansas": [
    { name: "Hunter Dickinson", emImpact: -4.0, star: 3, role: "All-American center" },
    { name: "Zeke Mayo", emImpact: -2.5, star: 2, role: "Starting guard, lead scorer" },
  ],
  "St. John's": [
    { name: "Derik Queen", emImpact: -4.0, star: 3, role: "Transfer big, leading scorer" },
    { name: "RJ Luis", emImpact: -2.5, star: 2, role: "Starting wing" },
  ],
  "Louisville": [
    { name: "Chucky Hepburn", emImpact: -3.5, star: 3, role: "Point guard, floor general" },
    { name: "Terrence Edwards", emImpact: -2.0, star: 2, role: "Starting wing" },
  ],
  "UCLA": [
    { name: "Tyler Bilodeau", emImpact: -3.0, star: 2, role: "Starting forward, key scorer" },
    { name: "Skyy Clark", emImpact: -2.5, star: 2, role: "Starting guard" },
  ],
  "Ohio St": [
    { name: "Bruce Thornton", emImpact: -3.0, star: 2, role: "Point guard, leader" },
    { name: "Devin Royal", emImpact: -2.5, star: 2, role: "Starting forward" },
  ],
  "TCU": [
    { name: "Vasean Allette", emImpact: -3.0, star: 2, role: "Leading scorer" },
    { name: "Noah Reynolds", emImpact: -2.5, star: 2, role: "Transfer guard" },
  ],
  "Florida": [
    { name: "Walter Clayton", emImpact: -4.5, star: 3, role: "Senior guard, team leader, leading scorer" },
    { name: "Alex Condon", emImpact: -3.0, star: 2, role: "Starting center" },
    { name: "Alijah Martin", emImpact: -2.0, star: 2, role: "Starting wing" },
  ],
  "Houston": [
    { name: "J'Wan Roberts", emImpact: -3.5, star: 3, role: "Defensive anchor, leading rebounder" },
    { name: "LJ Cryer", emImpact: -3.0, star: 2, role: "Starting guard, perimeter scorer" },
    { name: "Milos Uzan", emImpact: -2.5, star: 2, role: "Point guard, playmaker" },
  ],
  "Illinois": [
    { name: "Kasparas Jakucionis", emImpact: -4.5, star: 3, role: "Star point guard, primary creator" },
    { name: "Tomislav Ivisic", emImpact: -3.0, star: 2, role: "Starting center, inside scoring" },
    { name: "Tre White", emImpact: -2.0, star: 2, role: "Starting wing" },
  ],
  "Nebraska": [
    { name: "Brice Williams", emImpact: -3.5, star: 3, role: "Senior leader, leading scorer" },
    { name: "Connor Essegian", emImpact: -2.0, star: 2, role: "Sharpshooter" },
  ],
  "Vanderbilt": [
    { name: "Jason Edwards", emImpact: -4.0, star: 3, role: "Leading scorer, go-to guy" },
    { name: "Tyler Nickel", emImpact: -2.5, star: 2, role: "Starting wing, secondary scorer" },
    { name: "JaVon Price", emImpact: -2.0, star: 2, role: "Point guard" },
  ],
  "North Carolina": [
    { name: "RJ Wilson", emImpact: -5.0, star: 3, role: "Star forward (currently injured - thumb)" },
    { name: "Elliot Cadeau", emImpact: -3.0, star: 2, role: "Point guard" },
    { name: "Ian Jackson", emImpact: -2.5, star: 2, role: "Freshman wing, scorer" },
  ],
  "Saint Mary's": [
    { name: "Augustas Marciulionis", emImpact: -3.5, star: 3, role: "Leading scorer, WCC POY contender" },
    { name: "Mitchell Saxen", emImpact: -2.5, star: 2, role: "Starting big" },
  ],
  "Arizona": [
    { name: "Caleb Love", emImpact: -4.5, star: 3, role: "Star guard, primary scorer" },
    { name: "Trey Townsend", emImpact: -3.0, star: 2, role: "Starting forward, key two-way player" },
    { name: "KJ Lewis", emImpact: -2.5, star: 2, role: "Starting guard" },
  ],
  "Purdue": [
    { name: "Trey Kaufman-Renn", emImpact: -4.0, star: 3, role: "All-American center" },
    { name: "Braden Smith", emImpact: -4.0, star: 3, role: "Elite point guard, playmaker" },
    { name: "Fletcher Loyer", emImpact: -2.0, star: 2, role: "Starting shooting guard" },
  ],
  "Gonzaga": [
    { name: "Khalif Battle", emImpact: -3.5, star: 3, role: "Graduate guard, leading scorer" },
    { name: "Graham Ike", emImpact: -3.0, star: 2, role: "Starting center" },
    { name: "Ryan Nembhard", emImpact: -3.0, star: 2, role: "Point guard, floor general" },
  ],
  "Arkansas": [
    { name: "Adou Thiero", emImpact: -3.5, star: 3, role: "Transfer forward, leading scorer" },
    { name: "Johnell Davis", emImpact: -3.0, star: 2, role: "Transfer guard, key creator" },
    { name: "Boogie Fland", emImpact: -2.5, star: 2, role: "Freshman guard" },
  ],
  "Wisconsin": [
    { name: "John Tonje", emImpact: -3.5, star: 3, role: "Transfer guard, leading scorer" },
    { name: "John Blackwell", emImpact: -2.5, star: 2, role: "Sophomore guard" },
  ],
  "BYU": [
    { name: "Egor Demin", emImpact: -3.5, star: 3, role: "Freshman star, NBA prospect" },
    { name: "Trevin Knell", emImpact: -2.0, star: 2, role: "Senior guard, shooter" },
  ],
  "Michigan": [
    { name: "Bryce Cason", emImpact: -3.5, star: 3, role: "Starting guard (currently OUT - ACL)" },
    { name: "Danny Wolf", emImpact: -4.0, star: 3, role: "Star center, all-around" },
    { name: "Vladislav Goldin", emImpact: -3.0, star: 2, role: "Starting forward" },
  ],
  "Iowa St": [
    { name: "Keshon Gilbert", emImpact: -4.0, star: 3, role: "Point guard, defensive anchor" },
    { name: "Curtis Jones", emImpact: -3.0, star: 2, role: "Starting guard, scorer" },
    { name: "Milan Momcilovic", emImpact: -2.0, star: 2, role: "Starting wing, shooter" },
  ],
  "Virginia": [
    { name: "Isaac McKneely", emImpact: -3.5, star: 3, role: "Leading scorer, senior guard" },
    { name: "Andrew Rohde", emImpact: -2.5, star: 2, role: "Transfer guard" },
  ],
  "Alabama": [
    { name: "Mark Sears", emImpact: -4.5, star: 3, role: "Star guard, leading scorer" },
    { name: "Grant Nelson", emImpact: -3.0, star: 2, role: "Versatile forward" },
    { name: "Labaron Philon", emImpact: -2.0, star: 2, role: "Freshman guard" },
  ],
  "Texas Tech": [
    { name: "JT Toppin", emImpact: -4.0, star: 3, role: "Star forward (currently OUT - ACL)" },
    { name: "Chance McMillian", emImpact: -2.5, star: 2, role: "Starting guard" },
    { name: "Darrion Williams", emImpact: -2.0, star: 2, role: "Starting wing" },
  ],
  "Tennessee": [
    { name: "Chaz Lanier", emImpact: -4.0, star: 3, role: "Transfer guard, leading scorer" },
    { name: "Zakai Zeigler", emImpact: -3.5, star: 3, role: "Point guard, heart of team" },
    { name: "Igor Milicic", emImpact: -2.0, star: 2, role: "Starting forward" },
  ],
  "Kentucky": [
    { name: "Otega Oweh", emImpact: -3.5, star: 3, role: "Leading scorer, wing" },
    { name: "Lamont Butler", emImpact: -3.0, star: 2, role: "Transfer PG, floor general" },
    { name: "Amari Williams", emImpact: -2.5, star: 2, role: "Starting center" },
  ],
  "Georgia": [
    { name: "Asa Newell", emImpact: -3.5, star: 3, role: "Freshman star, leading scorer" },
    { name: "Silas Demary Jr.", emImpact: -2.5, star: 2, role: "Transfer guard" },
  ],
  // Mid-majors / lower seeds — top 1-2 players
  "Clemson": [
    { name: "Chase Hunter", emImpact: -3.0, star: 2, role: "Senior guard" },
    { name: "Ian Schieffelin", emImpact: -2.5, star: 2, role: "Double-double forward" },
  ],
  "Iowa": [
    { name: "Owen Freeman", emImpact: -3.0, star: 2, role: "Center, leading scorer" },
    { name: "Drew Thelwell", emImpact: -2.0, star: 2, role: "Transfer guard" },
  ],
  "Villanova": [
    { name: "Wooga Poplar", emImpact: -3.0, star: 2, role: "Leading scorer" },
    { name: "Eric Dixon", emImpact: -3.0, star: 2, role: "Big man, inside-out threat" },
  ],
  "Missouri": [
    { name: "Tamar Bates", emImpact: -3.0, star: 2, role: "Leading scorer" },
    { name: "Mark Mitchell", emImpact: -2.5, star: 2, role: "Starting forward" },
  ],
  "Texas": [
    { name: "Tre Johnson", emImpact: -3.5, star: 3, role: "Freshman star, leading scorer" },
    { name: "Arthur Kaluma", emImpact: -2.0, star: 2, role: "Starting forward" },
  ],
  "Miami (OH)": [
    { name: "Peter Resolve", emImpact: -2.5, star: 2, role: "Leading scorer" },
    { name: "Eian Elmer", emImpact: -2.0, star: 2, role: "Starting guard" },
  ],
  "Santa Clara": [
    { name: "Carlos Stewart", emImpact: -3.0, star: 2, role: "Leading scorer" },
    { name: "Christfe Nzekwe", emImpact: -2.0, star: 2, role: "Starting forward" },
  ],
  "Saint Louis": [
    { name: "Robbie Avila", emImpact: -3.5, star: 3, role: "Center, A10 POY" },
    { name: "Isaiah Swope", emImpact: -2.0, star: 2, role: "Starting guard" },
  ],
  "VCU": [
    { name: "Max Shulga", emImpact: -3.0, star: 2, role: "Guard, primary scorer" },
    { name: "Joe Bamisile", emImpact: -2.0, star: 2, role: "Starting wing" },
  ],
  "UCF": [
    { name: "Jordan Ivy-Curry", emImpact: -2.5, star: 2, role: "Leading scorer" },
  ],
  "South Florida": [
    { name: "Jayden Reid", emImpact: -2.5, star: 2, role: "Point guard, primary creator" },
  ],
  "Texas A&M": [
    { name: "Wade Taylor IV", emImpact: -3.5, star: 3, role: "Point guard, team leader" },
    { name: "Andersson Garcia", emImpact: -2.0, star: 2, role: "Starting big" },
  ],
  "Miami (FL)": [
    { name: "Nijel Pack", emImpact: -3.0, star: 2, role: "Transfer guard, scorer" },
  ],
  "Utah St": [
    { name: "Great Osobor", emImpact: -3.5, star: 3, role: "Center, MWC POY" },
    { name: "Ian Martinez", emImpact: -2.0, star: 2, role: "Starting guard" },
  ],
  "Akron": [
    { name: "Enrique Freeman", emImpact: -3.5, star: 3, role: "Center, MAC POY" },
  ],
  "McNeese": [
    { name: "Shahada Wells", emImpact: -3.5, star: 3, role: "Guard, Southland POY" },
  ],
  "High Point": [
    { name: "Abdou Ndiaye", emImpact: -3.0, star: 2, role: "Leading scorer" },
  ],
  "N. Iowa": [
    { name: "Tytan Anderson", emImpact: -3.0, star: 2, role: "Forward, team leader" },
  ],
};

// Build a flat lookup: lowercase player name → { team, emImpact, star, role }
export const PLAYER_LOOKUP = {};
for (const [team, players] of Object.entries(PLAYER_DB)) {
  for (const p of players) {
    // Store by multiple name variants for fuzzy matching
    const key = p.name.toLowerCase();
    PLAYER_LOOKUP[key] = { ...p, team };
    // Also store last name only for partial matching
    const parts = p.name.split(" ");
    if (parts.length > 1) {
      PLAYER_LOOKUP[parts[parts.length - 1].toLowerCase()] = { ...p, team };
    }
  }
}
