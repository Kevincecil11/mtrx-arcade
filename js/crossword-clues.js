// MTRX™ Arcade · Crossword clue bank. Original clues written for MTRX Digital (Property of MTRX Digital).
// One line per entry: ANSWER|clue. Levels get harder by vocabulary first, then by how indirect the clue is.
const raw = {
  easy: `
APPLE|Red or green fruit that keeps the doctor away
TIGER|Striped big cat
OCEAN|Huge body of salt water
BREAD|Loaf from the bakery
CHAIR|Seat with four legs and a back
RIVER|The Nile or the Ganges
CLOUD|White puff in the sky
HONEY|Sweet stuff made by bees
TRAIN|It runs on rails
PIANO|Instrument with black and white keys
SNOW|White winter flakes
MOON|It lights up the night sky
BOOK|A novel, for one
CAMEL|Desert animal with a hump
LEMON|Sour yellow fruit
PLANET|Earth or Mars
GARDEN|Where flowers and vegetables grow
WINTER|The coldest season
DOCTOR|Person in a white coat who treats you
SMILE|Happy expression
TABLE|Furniture you eat at
HORSE|Animal you can ride
CANDLE|Wax light with a wick
ORANGE|Fruit and colour with the same name
PENCIL|Writing tool with an eraser on top
BRIDGE|It crosses a river
CLOCK|It tells the time on a wall
EAGLE|Large bird of prey
MOUSE|Small rodent, or a computer gadget
SALT|It's shaken onto chips
RAIN|Water falling from clouds
STAR|Twinkling light in the night sky
TREE|An oak or a pine
FISH|Swimmer with fins and gills
BANANA|Long yellow fruit that monkeys love
KITCHEN|Room where meals are cooked
SUMMER|The warmest season
ISLAND|Land surrounded by water
MUSIC|What a band plays
SHOE|You wear it on your foot
SUN|Star at the centre of our solar system
EGG|A hen lays it
ICE|Frozen water
DOG|Man's best friend
CAT|Pet that purrs
OWL|Night bird that hoots
BEE|Buzzing insect that stings
EAR|You listen with it
CAKE|Birthday treat with candles
MILK|White drink from a cow
DOOR|You open it to enter a room
WINDOW|Glass pane in a wall
FOREST|Large area full of trees
DESERT|The Sahara, for example
ROBOT|Machine that can act on its own
CASTLE|Home of a king, with towers
PIZZA|Italian dish with a cheesy topping
GUITAR|Instrument with six strings
ZEBRA|Black-and-white striped animal
PARROT|Colourful bird that can talk
MONKEY|Banana-loving animal that climbs trees
SPOON|Utensil for soup
BOTTLE|Container for water or juice
POCKET|Pouch sewn into trousers
ROCKET|It launches into space
BASKET|Woven container for a picnic`,
  medium: `
ANCHOR|It keeps a ship from drifting
BALLOT|Paper used to vote
CACTUS|Spiky desert plant
DIALECT|Regional form of a language
EMPIRE|Rome at its height, say
FOSSIL|Ancient remains preserved in rock
GLACIER|Slow-moving river of ice
HARVEST|Gathering of the crops
IVORY|Elephant tusk material
JUNGLE|Dense tropical forest
KETTLE|It whistles when the water boils
LANTERN|Portable lamp with a handle
MAGNET|It attracts iron
NECTAR|Sweet liquid that bees collect
ORBIT|Path of a planet around the sun
PUZZLE|A jigsaw, for example
QUARTZ|Common crystal used in watches
RHYTHM|The beat in music
SALARY|Regular monthly pay
THUNDER|Rumble that follows lightning
UMPIRE|Official at a cricket match
VOLCANO|Mountain that can erupt
WALRUS|Tusked Arctic sea mammal
YOGURT|Fermented milk food
ZENITH|Highest point
ATLAS|Book of maps
BAMBOO|A panda's favourite plant
CANVAS|Painter's fabric surface
DONKEY|Animal that brays
ECLIPSE|When the moon blocks the sun
FEATHER|A quill is made from one
GRAVITY|Force that keeps your feet on the ground
HORIZON|Line where the sky meets the sea
INSECT|Six-legged creature
JOURNEY|Long trip
KNIGHT|Chess piece that moves in an L
LAGOON|Shallow pool cut off from the sea
MIRROR|It shows your reflection
NAPKIN|Square of cloth or paper used at meals
OXYGEN|Gas we breathe to stay alive
PEPPER|Salt's partner on the table
RECIPE|Instructions for cooking a dish
SADDLE|Rider's seat on a horse
TUNNEL|Passage dug under a hill
VELVET|Soft fabric with a thick pile
WIZARD|Merlin, for one
ALMOND|Nut used to make marzipan
BLIZZARD|Severe snowstorm
COMPASS|It points north
DIAMOND|Hardest natural gem
FAMINE|Severe shortage of food
GALAXY|The Milky Way, for one
HAMMER|Tool for driving nails
MARATHON|Race of about 42 kilometres
PEARL|Gem from an oyster
PYRAMID|Ancient tomb at Giza
SPINACH|Popeye's leafy green
TROPHY|Cup given to a winner
VACCINE|Shot that protects against disease
WHISPER|Speak very softly`,
  intermediate: `
ALIBI|Proof you were somewhere else
BOYCOTT|Refuse to buy, as a protest
CANDID|Frank and honest
DEBRIS|Scattered wreckage
EMBARGO|Official ban on trade
FRUGAL|Careful with money
GAZEBO|Garden pavilion with a view
HIATUS|Pause or break in activity
IRONY|Saying the opposite of what you mean
JARGON|Specialist language of a trade
KIOSK|Small booth selling newspapers
LETHARGY|Lack of energy
MIRAGE|Desert illusion of water
NOSTALGIA|Wistful longing for the past
OBSOLETE|No longer in use
PARADOX|Statement that seems to contradict itself
QUARANTINE|Isolation period to stop a disease spreading
RESILIENT|Quick to bounce back
SYNONYM|Big, for large
TEMPO|Speed of a piece of music
UTOPIA|Imagined perfect society
VERDICT|A jury's decision
WANDERLUST|Strong desire to travel
ZEALOUS|Extremely enthusiastic
AMBIGUOUS|Open to more than one meaning
BENEVOLENT|Kind and generous
CATALYST|Something that speeds up a change
DILEMMA|Choice between two bad options
ELOQUENT|Fluent and persuasive in speech
FLAMBOYANT|Showy and confident
GRANITE|Hard rock used for kitchen counters
HYPOTHESIS|Idea to be tested by experiment
INERTIA|Tendency to stay at rest
JUBILEE|Special anniversary celebration
LABYRINTH|Maze, especially a mythical one
MENTOR|Trusted adviser
NOCTURNAL|Active at night
OPTIMIST|Glass-half-full person
PENINSULA|Land almost surrounded by water
QUOTA|Fixed share or limit
RANSOM|Money demanded for a captive
SARCASM|Mocking wit, often with a sneer
TERRAIN|The lie of the land
UNANIMOUS|Agreed by everyone
VERTIGO|Dizzy fear of heights
WHIMSICAL|Playfully quaint
ANECDOTE|Short, amusing personal story
BOUTIQUE|Small fashionable shop
CHRONIC|Lasting a long time, as an illness
DEADLOCK|Situation where neither side can win
EPIPHANY|Sudden moment of insight
FIASCO|Complete, humiliating failure
GENRE|Horror or romance, in film
HAVOC|Widespread chaos
IDIOM|"Raining cats and dogs", for one
MOSAIC|Picture made of small tiles
NUANCE|Subtle difference in meaning
PROTOCOL|Official rules of behaviour`,
  hard: `
SERENDIPITY|Happy accident
PALINDROME|Level or radar, for example
EPHEMERAL|Lasting a very short time
UBIQUITOUS|Found everywhere
CACOPHONY|Harsh jumble of sounds
PRAGMATIC|Practical rather than idealistic
ZEITGEIST|Spirit of the age
JUXTAPOSE|Place side by side for contrast
QUIXOTIC|Idealistic to the point of impracticality
SYCOPHANT|Flattering yes-man
OBFUSCATE|Make deliberately unclear
LACONIC|Using very few words
MERCURIAL|Prone to sudden mood changes
NEFARIOUS|Wicked or criminal
PERFUNCTORY|Done with the minimum of effort
SAGACIOUS|Wise and shrewd
TENACIOUS|Holding on firmly; persistent
VICARIOUS|Experienced through someone else
ANACHRONISM|A clock in a film about ancient Rome, say
BELLWETHER|Leader or indicator of trends
CATHARSIS|Emotional release, as through art
DIATRIBE|Bitter verbal attack
EUPHEMISM|"Passed away", in place of "died"
FASTIDIOUS|Very fussy about detail and cleanliness
GREGARIOUS|Fond of company
HUBRIS|Excessive pride before a fall
ICONOCLAST|Attacker of cherished beliefs
JEOPARDY|Danger
KITSCH|Tacky art enjoyed ironically
LUDDITE|Opponent of new technology
MAVERICK|Independent-minded nonconformist
NEMESIS|Arch-enemy
PARIAH|Social outcast
PLACEBO|Sugar pill in a drug trial
QUANDARY|State of perplexity
RHETORIC|Persuasive language, often empty
SOLILOQUY|"To be or not to be", for one
TACITURN|Reserved and quiet
UMBRAGE|Offence, as in "take ___"
VENDETTA|Long-running blood feud
WISTFUL|Longingly sad
ALGORITHM|Step-by-step recipe for a computer
BOHEMIAN|Unconventional, artistic sort
CHARLATAN|Fraud who claims special skill
ENIGMA|Mystery that seems impossible to solve
FILIBUSTER|Lengthy speech made to delay a vote
GAMBIT|Opening that sacrifices a pawn
HEDONIST|Pleasure-seeker
INCOGNITO|In disguise
MELANCHOLY|Pensive sadness
NOMAD|Wanderer without a fixed home
OXYMORON|"Deafening silence", for example`,
  expert: `
MOUSETRAP|Cheesy device?
SNOWMAN|Cool guy with a carrot?
DENTIST|Person who does a lot of filling work?
BARBER|Professional who takes a little off the top
ORCHESTRA|Pit crew?
ASTRONAUT|One taking up space?
BAKERY|Place with a lot of rolls
ICEBERG|Its tip-off sank the Titanic?
SHADOW|Constant companion on a sunny day
KEYBOARD|Where to find an escape, usually top left
WATCH|Face with hands, worn on one
SPONGE|It soaks up everything you give it
LIBRARY|Place to check things out quietly
POSTMAN|Man of letters?
CHEF|Stirring figure in a restaurant?
TELESCOPE|It brings stars closer, though not on a red carpet
UMBRELLA|Cover that goes up when it's coming down
PARACHUTE|It only works once it's open
CALENDAR|Its days are numbered
SKELETON|It's kept in a closet, or inside you
GARDENER|One with plenty of plots but no novels
EGGSHELL|Paint finish people walk on?
BANK|It has branches but no leaves
MAP|It has cities but no houses
ECHO|It only speaks when spoken to
NEEDLE|It has an eye but can't see
PROMISE|Something you can break without touching it
SILENCE|Say its name and it's gone
TOMORROW|It's always coming but never arrives
FOOTSTEPS|The more you take, the more you leave behind
HOLE|The more you take out, the bigger it gets
TOWEL|It gets wetter the more it dries
STAMP|It travels the world while staying in a corner
COMB|It has teeth but never bites
GLOVE|It has fingers but no bones
POTATO|Vegetable that keeps an eye out?
HISTORY|Subject that's all in the past
ALPHABET|It runs from A to Z
INSOMNIA|Problem that keeps you up at night
SECRET|You keep it by sharing it with no one
AGE|It goes up but never comes down
BOOMERANG|Gift that keeps coming back?
GOSSIP|It spreads without legs
LIGHTHOUSE|Tower that warns but never speaks
SANDCASTLE|Fortress defeated by the tide
HOURGLASS|Timer that's always half empty and half full?
PASSWORD|Secret entry that's case-sensitive
QUEUE|One letter followed by four silent ones
INFINITY|Endless amount, like a figure eight on its side`,
};
export const BANK = Object.fromEntries(Object.entries(raw).map(([k, v]) => [k, v.trim().split('\n').map((l) => { const [a, c] = l.split('|'); return { a: a.trim(), c: c.trim() }; })]));
