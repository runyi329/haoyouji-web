// 2026 FIFA World Cup 球队档案数据
// 数据来源：维基百科 2026 FIFA World Cup squads（2026年5月30日）
// FIFA 世界排名来源：FIFA 官网（2026年5月最新）

export interface Player {
  pos: "GK" | "DF" | "MF" | "FW";
  name: string;
  age: number;
  caps: number;
  goals: number;
  club: string;
  captain?: boolean;
}

export interface TeamData {
  code: string;       // 国旗代码
  name: string;       // 英文名
  nameCn: string;     // 中文名
  group: string;      // 小组
  fifaRank: number;   // FIFA排名
  coach: string;      // 主教练
  players: Player[];
}

export const wcTeams: TeamData[] = [
  // ===== GROUP A =====
  {
    code: "cz", name: "Czech Republic", nameCn: "捷克", group: "A",
    fifaRank: 36, coach: "Miroslav Koubek",
    players: [
      { pos: "GK", name: "Matěj Kovář", age: 26, caps: 19, goals: 0, club: "PSV Eindhoven" },
      { pos: "GK", name: "Jindřich Staněk", age: 30, caps: 14, goals: 0, club: "Slavia Prague" },
      { pos: "GK", name: "Lukáš Horníček", age: 23, caps: 0, goals: 0, club: "Braga" },
      { pos: "DF", name: "Vladimír Coufal", age: 33, caps: 61, goals: 2, club: "TSG Hoffenheim" },
      { pos: "DF", name: "Tomáš Holeš", age: 33, caps: 39, goals: 2, club: "Slavia Prague" },
      { pos: "DF", name: "Ladislav Krejčí", age: 27, caps: 25, goals: 5, club: "Wolverhampton Wanderers", captain: true },
      { pos: "DF", name: "David Zima", age: 25, caps: 24, goals: 1, club: "Slavia Prague" },
      { pos: "DF", name: "Jaroslav Zelený", age: 33, caps: 21, goals: 0, club: "Sparta Prague" },
      { pos: "DF", name: "David Jurásek", age: 25, caps: 16, goals: 1, club: "Slavia Prague" },
      { pos: "DF", name: "David Douděra", age: 28, caps: 15, goals: 2, club: "Slavia Prague" },
      { pos: "DF", name: "Robin Hranáč", age: 26, caps: 12, goals: 1, club: "TSG Hoffenheim" },
      { pos: "DF", name: "Štěpán Chaloupek", age: 23, caps: 3, goals: 0, club: "Slavia Prague" },
      { pos: "MF", name: "Tomáš Souček", age: 31, caps: 89, goals: 17, club: "West Ham United" },
      { pos: "MF", name: "Vladimír Darida", age: 35, caps: 78, goals: 8, club: "Hradec Králové" },
      { pos: "MF", name: "Lukáš Provod", age: 29, caps: 37, goals: 3, club: "Slavia Prague" },
      { pos: "MF", name: "Michal Sadílek", age: 27, caps: 33, goals: 1, club: "Slavia Prague" },
      { pos: "MF", name: "Pavel Šulc", age: 25, caps: 20, goals: 5, club: "Lyon" },
      { pos: "MF", name: "Lukáš Červ", age: 25, caps: 15, goals: 2, club: "Viktoria Plzeň" },
      { pos: "MF", name: "Tomáš Ladra", age: 29, caps: 1, goals: 0, club: "Viktoria Plzeň" },
      { pos: "MF", name: "Pavel Bucha", age: 28, caps: 0, goals: 0, club: "FC Cincinnati" },
      { pos: "FW", name: "Patrik Schick", age: 30, caps: 52, goals: 25, club: "Bayer Leverkusen" },
      { pos: "FW", name: "Adam Hložek", age: 23, caps: 41, goals: 4, club: "TSG Hoffenheim" },
      { pos: "FW", name: "Jan Kuchta", age: 29, caps: 30, goals: 3, club: "Sparta Prague" },
      { pos: "FW", name: "Tomáš Chorý", age: 31, caps: 21, goals: 6, club: "Slavia Prague" },
      { pos: "FW", name: "Mojmír Chytil", age: 27, caps: 21, goals: 6, club: "Slavia Prague" },
      { pos: "FW", name: "Christophe Kabongo", age: 22, caps: 0, goals: 0, club: "Mladá Boleslav" },
    ]
  },
  {
    code: "mx", name: "Mexico", nameCn: "墨西哥", group: "A",
    fifaRank: 16, coach: "Javier Aguirre",
    players: [
      { pos: "GK", name: "Guillermo Ochoa", age: 40, caps: 151, goals: 0, club: "AEL Limassol" },
      { pos: "GK", name: "Raúl Rangel", age: 26, caps: 12, goals: 0, club: "Guadalajara" },
      { pos: "GK", name: "Carlos Acevedo", age: 30, caps: 7, goals: 0, club: "Santos Laguna" },
      { pos: "DF", name: "Jesús Gallardo", age: 31, caps: 119, goals: 3, club: "Toluca" },
      { pos: "DF", name: "César Montes", age: 29, caps: 65, goals: 4, club: "Lokomotiv Moscow" },
      { pos: "DF", name: "Jorge Sánchez", age: 28, caps: 57, goals: 3, club: "PAOK" },
      { pos: "DF", name: "Johan Vásquez", age: 27, caps: 44, goals: 1, club: "Genoa" },
      { pos: "DF", name: "Israel Reyes", age: 26, caps: 32, goals: 2, club: "América" },
      { pos: "DF", name: "Julián Araujo", age: 24, caps: 16, goals: 0, club: "Celtic" },
      { pos: "MF", name: "Edson Álvarez", age: 28, caps: 96, goals: 7, club: "Fenerbahçe", captain: true },
      { pos: "MF", name: "Orbelín Pineda", age: 30, caps: 90, goals: 12, club: "AEK Athens" },
      { pos: "MF", name: "Carlos Rodríguez", age: 29, caps: 67, goals: 0, club: "Cruz Azul" },
      { pos: "MF", name: "Roberto Alvarado", age: 27, caps: 66, goals: 5, club: "Guadalajara" },
      { pos: "MF", name: "Luis Romo", age: 31, caps: 61, goals: 4, club: "Guadalajara" },
      { pos: "MF", name: "Luis Chávez", age: 30, caps: 43, goals: 4, club: "Dynamo Moscow" },
      { pos: "MF", name: "Diego Lainez", age: 26, caps: 33, goals: 3, club: "UANL" },
      { pos: "FW", name: "Raúl Jiménez", age: 35, caps: 123, goals: 44, club: "Fulham" },
      { pos: "FW", name: "Alexis Vega", age: 28, caps: 50, goals: 7, club: "Toluca" },
      { pos: "FW", name: "Santiago Giménez", age: 25, caps: 46, goals: 6, club: "Milan" },
      { pos: "FW", name: "César Huerta", age: 25, caps: 25, goals: 3, club: "Anderlecht" },
      { pos: "FW", name: "Julián Quiñones", age: 29, caps: 20, goals: 2, club: "Al-Qadsiah" },
    ]
  },
  {
    code: "za", name: "South Africa", nameCn: "南非", group: "A",
    fifaRank: 63, coach: "Hugo Broos",
    players: [
      { pos: "GK", name: "Ronwen Williams", age: 34, caps: 62, goals: 0, club: "Mamelodi Sundowns", captain: true },
      { pos: "GK", name: "Ricardo Goss", age: 32, caps: 4, goals: 0, club: "Siwelele" },
      { pos: "GK", name: "Sipho Chaine", age: 29, caps: 3, goals: 0, club: "Orlando Pirates" },
      { pos: "DF", name: "Aubrey Modiba", age: 30, caps: 44, goals: 3, club: "Mamelodi Sundowns" },
      { pos: "DF", name: "Khuliso Mudau", age: 31, caps: 32, goals: 1, club: "Mamelodi Sundowns" },
      { pos: "DF", name: "Nkosinathi Sibisi", age: 30, caps: 19, goals: 0, club: "Orlando Pirates" },
      { pos: "DF", name: "Mbekezeli Mbokazi", age: 20, caps: 10, goals: 1, club: "Chicago Fire FC" },
      { pos: "DF", name: "Ime Okon", age: 22, caps: 7, goals: 1, club: "Hannover 96" },
      { pos: "MF", name: "Teboho Mokoena", age: 29, caps: 51, goals: 9, club: "Mamelodi Sundowns" },
      { pos: "MF", name: "Sphephelo Sithole", age: 27, caps: 27, goals: 1, club: "Tondela" },
      { pos: "MF", name: "Thalente Mbatha", age: 26, caps: 14, goals: 3, club: "Orlando Pirates" },
      { pos: "MF", name: "Jayden Adams", age: 25, caps: 4, goals: 0, club: "Mamelodi Sundowns" },
      { pos: "FW", name: "Themba Zwane", age: 36, caps: 53, goals: 12, club: "Mamelodi Sundowns" },
      { pos: "FW", name: "Lyle Foster", age: 26, caps: 26, goals: 10, club: "Burnley" },
      { pos: "FW", name: "Evidence Makgopa", age: 26, caps: 26, goals: 6, club: "Orlando Pirates" },
      { pos: "FW", name: "Oswin Appollis", age: 24, caps: 25, goals: 8, club: "Orlando Pirates" },
      { pos: "FW", name: "Iqraam Rayners", age: 30, caps: 13, goals: 4, club: "Mamelodi Sundowns" },
      { pos: "FW", name: "Relebohile Mofokeng", age: 21, caps: 12, goals: 0, club: "Orlando Pirates" },
    ]
  },
  {
    code: "kr", name: "South Korea", nameCn: "韩国", group: "A",
    fifaRank: 22, coach: "Hong Myung-bo",
    players: [
      { pos: "GK", name: "Kim Seung-gyu", age: 35, caps: 85, goals: 0, club: "FC Tokyo" },
      { pos: "GK", name: "Jo Hyeon-woo", age: 34, caps: 47, goals: 0, club: "Ulsan HD" },
      { pos: "GK", name: "Song Bum-keun", age: 28, caps: 2, goals: 0, club: "Jeonbuk Hyundai Motors" },
      { pos: "DF", name: "Kim Min-jae", age: 29, caps: 77, goals: 4, club: "Bayern Munich" },
      { pos: "DF", name: "Kim Moon-hwan", age: 30, caps: 34, goals: 0, club: "Daejeon Hana Citizen" },
      { pos: "DF", name: "Seol Young-woo", age: 27, caps: 32, goals: 0, club: "Red Star Belgrade" },
      { pos: "DF", name: "Cho Yu-min", age: 29, caps: 18, goals: 0, club: "Sharjah" },
      { pos: "DF", name: "Lee Tae-seok", age: 23, caps: 14, goals: 1, club: "Austria Wien" },
      { pos: "MF", name: "Lee Jae-sung", age: 33, caps: 103, goals: 15, club: "Mainz 05" },
      { pos: "MF", name: "Hwang Hee-chan", age: 30, caps: 77, goals: 16, club: "Wolverhampton Wanderers" },
      { pos: "MF", name: "Hwang In-beom", age: 29, caps: 71, goals: 6, club: "Feyenoord" },
      { pos: "MF", name: "Lee Kang-in", age: 25, caps: 46, goals: 11, club: "Paris Saint-Germain" },
      { pos: "MF", name: "Paik Seung-ho", age: 29, caps: 25, goals: 3, club: "Birmingham City" },
      { pos: "MF", name: "Bae Jun-ho", age: 22, caps: 12, goals: 2, club: "Stoke City" },
      { pos: "FW", name: "Son Heung-min", age: 33, caps: 142, goals: 54, club: "Los Angeles FC", captain: true },
      { pos: "FW", name: "Cho Gue-sung", age: 28, caps: 42, goals: 10, club: "Midtjylland" },
      { pos: "FW", name: "Oh Hyeon-gyu", age: 25, caps: 26, goals: 6, club: "Beşiktaş" },
    ]
  },

  // ===== GROUP B =====
  {
    code: "ba", name: "Bosnia and Herzegovina", nameCn: "波黑", group: "B",
    fifaRank: 62, coach: "Sergej Barbarez",
    players: [
      { pos: "GK", name: "Nikola Vasilj", age: 30, caps: 25, goals: 0, club: "FC St. Pauli" },
      { pos: "GK", name: "Martin Zlomislić", age: 27, caps: 2, goals: 0, club: "Rijeka" },
      { pos: "DF", name: "Sead Kolašinac", age: 32, caps: 64, goals: 0, club: "Atalanta" },
      { pos: "DF", name: "Dennis Hadžikadunić", age: 27, caps: 30, goals: 0, club: "Sampdoria" },
      { pos: "DF", name: "Amar Dedić", age: 23, caps: 26, goals: 1, club: "Benfica" },
      { pos: "DF", name: "Nikola Katić", age: 29, caps: 15, goals: 1, club: "Schalke 04" },
      { pos: "DF", name: "Tarik Muharemović", age: 23, caps: 12, goals: 1, club: "Sassuolo" },
      { pos: "MF", name: "Amir Hadžiahmetović", age: 29, caps: 34, goals: 0, club: "Hull City" },
      { pos: "MF", name: "Benjamin Tahirović", age: 23, caps: 26, goals: 2, club: "Brøndby" },
      { pos: "MF", name: "Armin Gigović", age: 24, caps: 18, goals: 1, club: "Young Boys" },
      { pos: "MF", name: "Esmir Bajraktarević", age: 21, caps: 14, goals: 1, club: "PSV Eindhoven" },
      { pos: "FW", name: "Edin Džeko", age: 40, caps: 148, goals: 73, club: "Schalke 04", captain: true },
      { pos: "FW", name: "Ermedin Demirović", age: 28, caps: 38, goals: 4, club: "VfB Stuttgart" },
      { pos: "FW", name: "Samed Baždar", age: 22, caps: 11, goals: 1, club: "Jagiellonia Białystok" },
      { pos: "FW", name: "Haris Tabaković", age: 31, caps: 10, goals: 4, club: "Borussia Mönchengladbach" },
    ]
  },
  {
    code: "ca", name: "Canada", nameCn: "加拿大", group: "B",
    fifaRank: 41, coach: "Jesse Marsch",
    players: [
      { pos: "GK", name: "Dayne St. Clair", age: 29, caps: 19, goals: 0, club: "Inter Miami CF" },
      { pos: "GK", name: "Maxime Crépeau", age: 32, caps: 30, goals: 0, club: "Orlando City SC" },
      { pos: "DF", name: "Alistair Johnston", age: 27, caps: 56, goals: 1, club: "Celtic" },
      { pos: "DF", name: "Alphonso Davies", age: 25, caps: 58, goals: 15, club: "Bayern Munich", captain: true },
      { pos: "DF", name: "Richie Laryea", age: 31, caps: 73, goals: 1, club: "Toronto FC" },
      { pos: "DF", name: "Derek Cornelius", age: 28, caps: 42, goals: 1, club: "Rangers" },
      { pos: "DF", name: "Moïse Bombito", age: 26, caps: 19, goals: 0, club: "Nice" },
      { pos: "MF", name: "Stephen Eustáquio", age: 29, caps: 54, goals: 4, club: "Los Angeles FC" },
      { pos: "MF", name: "Tajon Buchanan", age: 27, caps: 58, goals: 8, club: "Villarreal" },
      { pos: "MF", name: "Jonathan Osorio", age: 33, caps: 89, goals: 9, club: "Toronto FC" },
      { pos: "MF", name: "Ismaël Koné", age: 23, caps: 38, goals: 4, club: "Sassuolo" },
      { pos: "MF", name: "Liam Millar", age: 26, caps: 39, goals: 1, club: "Hull City" },
      { pos: "FW", name: "Jonathan David", age: 26, caps: 75, goals: 39, club: "Juventus" },
      { pos: "FW", name: "Cyle Larin", age: 31, caps: 88, goals: 30, club: "Southampton" },
      { pos: "FW", name: "Tani Oluwaseyi", age: 26, caps: 22, goals: 2, club: "Villarreal" },
    ]
  },
  {
    code: "qa", name: "Qatar", nameCn: "卡塔尔", group: "B",
    fifaRank: 58, coach: "Julen Lopetegui",
    players: [
      { pos: "GK", name: "Meshaal Barsham", age: 28, caps: 52, goals: 0, club: "Al-Sadd" },
      { pos: "GK", name: "Salah Zakaria", age: 27, caps: 8, goals: 0, club: "Al-Duhail" },
      { pos: "DF", name: "Boualem Khoukhi", age: 35, caps: 115, goals: 20, club: "Al-Sadd" },
      { pos: "DF", name: "Pedro Miguel", age: 35, caps: 98, goals: 3, club: "Al-Sadd" },
      { pos: "DF", name: "Homam Ahmed", age: 26, caps: 67, goals: 3, club: "Cultural Leonesa" },
      { pos: "MF", name: "Abdulaziz Hatem", age: 35, caps: 117, goals: 11, club: "Al-Rayyan" },
      { pos: "MF", name: "Karim Boudiaf", age: 35, caps: 117, goals: 5, club: "Al-Duhail" },
      { pos: "MF", name: "Assim Madibo", age: 29, caps: 50, goals: 0, club: "Al-Wakrah" },
      { pos: "MF", name: "Ahmed Fathy", age: 33, caps: 47, goals: 0, club: "Al-Arabi" },
      { pos: "FW", name: "Hassan Al-Haydos", age: 35, caps: 185, goals: 41, club: "Al-Sadd", captain: true },
      { pos: "FW", name: "Akram Afif", age: 29, caps: 124, goals: 39, club: "Al-Sadd" },
      { pos: "FW", name: "Almoez Ali", age: 29, caps: 115, goals: 55, club: "Al-Duhail" },
      { pos: "FW", name: "Mohammed Muntari", age: 32, caps: 67, goals: 16, club: "Al-Gharafa" },
      { pos: "FW", name: "Ahmed Alaaeldin", age: 33, caps: 67, goals: 9, club: "Al-Rayyan" },
    ]
  },
  {
    code: "ch", name: "Switzerland", nameCn: "瑞士", group: "B",
    fifaRank: 18, coach: "Murat Yakin",
    players: [
      { pos: "GK", name: "Gregor Kobel", age: 28, caps: 20, goals: 0, club: "Borussia Dortmund" },
      { pos: "GK", name: "Yvon Mvogo", age: 32, caps: 12, goals: 0, club: "Lorient" },
      { pos: "DF", name: "Silvan Widmer", age: 33, caps: 58, goals: 5, club: "Mainz 05" },
      { pos: "DF", name: "Nico Elvedi", age: 29, caps: 65, goals: 3, club: "Borussia Mönchengladbach" },
      { pos: "DF", name: "Manuel Akanji", age: 30, caps: 79, goals: 4, club: "Inter Milan" },
      { pos: "DF", name: "Ricardo Rodriguez", age: 33, caps: 136, goals: 9, club: "Real Betis" },
      { pos: "DF", name: "Eray Cömert", age: 28, caps: 20, goals: 0, club: "Valencia" },
      { pos: "MF", name: "Granit Xhaka", age: 33, caps: 144, goals: 16, club: "Sunderland", captain: true },
      { pos: "MF", name: "Denis Zakaria", age: 29, caps: 63, goals: 3, club: "Monaco" },
      { pos: "MF", name: "Remo Freuler", age: 34, caps: 86, goals: 11, club: "Bologna" },
      { pos: "MF", name: "Djibril Sow", age: 29, caps: 50, goals: 0, club: "Sevilla" },
      { pos: "MF", name: "Michel Aebischer", age: 29, caps: 38, goals: 2, club: "Pisa" },
      { pos: "MF", name: "Fabian Rieder", age: 24, caps: 27, goals: 1, club: "FC Augsburg" },
      { pos: "FW", name: "Breel Embolo", age: 29, caps: 85, goals: 23, club: "Rennes" },
      { pos: "FW", name: "Rubén Vargas", age: 27, caps: 60, goals: 11, club: "Sevilla" },
      { pos: "FW", name: "Dan Ndoye", age: 25, caps: 29, goals: 6, club: "Nottingham Forest" },
      { pos: "FW", name: "Noah Okafor", age: 26, caps: 24, goals: 2, club: "Leeds United" },
      { pos: "FW", name: "Zeki Amdouni", age: 25, caps: 27, goals: 11, club: "Burnley" },
    ]
  },

  // ===== GROUP C =====
  {
    code: "br", name: "Brazil", nameCn: "巴西", group: "C",
    fifaRank: 5, coach: "Carlo Ancelotti",
    players: [
      { pos: "GK", name: "Alisson", age: 33, caps: 76, goals: 0, club: "Liverpool" },
      { pos: "GK", name: "Ederson", age: 32, caps: 31, goals: 0, club: "Fenerbahçe" },
      { pos: "GK", name: "Weverton", age: 38, caps: 10, goals: 0, club: "Grêmio" },
      { pos: "DF", name: "Marquinhos", age: 32, caps: 104, goals: 7, club: "Paris Saint-Germain" },
      { pos: "DF", name: "Danilo Luiz", age: 34, caps: 68, goals: 1, club: "Flamengo" },
      { pos: "DF", name: "Alex Sandro", age: 35, caps: 43, goals: 2, club: "Flamengo" },
      { pos: "DF", name: "Gabriel Magalhães", age: 28, caps: 17, goals: 1, club: "Arsenal" },
      { pos: "DF", name: "Bremer", age: 29, caps: 6, goals: 1, club: "Juventus" },
      { pos: "MF", name: "Casemiro", age: 34, caps: 84, goals: 8, club: "Manchester United", captain: true },
      { pos: "MF", name: "Lucas Paquetá", age: 28, caps: 61, goals: 12, club: "Flamengo" },
      { pos: "MF", name: "Bruno Guimarães", age: 28, caps: 41, goals: 2, club: "Newcastle United" },
      { pos: "MF", name: "Fabinho", age: 32, caps: 31, goals: 0, club: "Al-Ittihad" },
      { pos: "FW", name: "Neymar", age: 34, caps: 128, goals: 79, club: "Santos" },
      { pos: "FW", name: "Vinícius Júnior", age: 25, caps: 47, goals: 8, club: "Real Madrid" },
      { pos: "FW", name: "Raphinha", age: 29, caps: 37, goals: 11, club: "Barcelona" },
      { pos: "FW", name: "Gabriel Martinelli", age: 24, caps: 22, goals: 4, club: "Arsenal" },
      { pos: "FW", name: "Matheus Cunha", age: 27, caps: 21, goals: 1, club: "Manchester United" },
      { pos: "FW", name: "Endrick", age: 19, caps: 15, goals: 3, club: "Lyon" },
    ]
  },
  {
    code: "ht", name: "Haiti", nameCn: "海地", group: "C",
    fifaRank: 96, coach: "Sébastien Migné",
    players: [
      { pos: "GK", name: "Johny Placide", age: 38, caps: 79, goals: 0, club: "Bastia", captain: true },
      { pos: "GK", name: "Alexandre Pierre", age: 25, caps: 14, goals: 0, club: "Sochaux" },
      { pos: "DF", name: "Ricardo Adé", age: 36, caps: 57, goals: 2, club: "LDU Quito" },
      { pos: "DF", name: "Carlens Arcus", age: 29, caps: 51, goals: 1, club: "Angers" },
      { pos: "DF", name: "Martin Expérience", age: 27, caps: 19, goals: 0, club: "Nancy" },
      { pos: "DF", name: "Jean-Kévin Duverne", age: 28, caps: 15, goals: 1, club: "Gent" },
      { pos: "MF", name: "Leverton Pierre", age: 28, caps: 33, goals: 0, club: "Vizela" },
      { pos: "MF", name: "Danley Jean Jacques", age: 26, caps: 28, goals: 6, club: "Philadelphia Union" },
      { pos: "MF", name: "Carl Sainté", age: 23, caps: 25, goals: 0, club: "El Paso Locomotive FC" },
      { pos: "MF", name: "Jean-Ricner Bellegarde", age: 27, caps: 8, goals: 0, club: "Wolverhampton Wanderers" },
      { pos: "FW", name: "Duckens Nazon", age: 32, caps: 76, goals: 44, club: "Esteghlal" },
      { pos: "FW", name: "Frantzdy Pierrot", age: 31, caps: 49, goals: 33, club: "Çaykur Rizespor" },
      { pos: "FW", name: "Derrick Etienne Jr.", age: 29, caps: 46, goals: 8, club: "Toronto FC" },
      { pos: "FW", name: "Louicius Deedson", age: 25, caps: 30, goals: 10, club: "FC Dallas" },
    ]
  },
  {
    code: "ma", name: "Morocco", nameCn: "摩洛哥", group: "C",
    fifaRank: 14, coach: "Mohamed Ouahbi",
    players: [
      { pos: "GK", name: "Yassine Bounou", age: 35, caps: 89, goals: 0, club: "Al-Hilal" },
      { pos: "GK", name: "Munir Mohamedi", age: 37, caps: 51, goals: 0, club: "RS Berkane" },
      { pos: "DF", name: "Achraf Hakimi", age: 27, caps: 95, goals: 11, club: "Paris Saint-Germain", captain: true },
      { pos: "DF", name: "Nayef Aguerd", age: 30, caps: 64, goals: 2, club: "Marseille" },
      { pos: "DF", name: "Noussair Mazraoui", age: 28, caps: 43, goals: 2, club: "Manchester United" },
      { pos: "DF", name: "Youssef Belammari", age: 27, caps: 16, goals: 0, club: "Al Ahly" },
      { pos: "DF", name: "Anass Salah-Eddine", age: 24, caps: 8, goals: 0, club: "PSV Eindhoven" },
      { pos: "MF", name: "Sofyan Amrabat", age: 29, caps: 73, goals: 0, club: "Real Betis" },
      { pos: "MF", name: "Azzedine Ounahi", age: 26, caps: 47, goals: 9, club: "Girona" },
      { pos: "MF", name: "Bilal El Khannouss", age: 22, caps: 35, goals: 3, club: "VfB Stuttgart" },
      { pos: "MF", name: "Ismael Saibari", age: 25, caps: 28, goals: 7, club: "PSV Eindhoven" },
      { pos: "FW", name: "Ayoub El Kaabi", age: 32, caps: 69, goals: 34, club: "Olympiacos" },
      { pos: "FW", name: "Soufiane Rahimi", age: 30, caps: 35, goals: 11, club: "Al Ain" },
      { pos: "FW", name: "Abde Ezzalzouli", age: 24, caps: 35, goals: 2, club: "Real Betis" },
      { pos: "FW", name: "Brahim Díaz", age: 26, caps: 24, goals: 13, club: "Real Madrid" },
    ]
  },
  {
    code: "gb-sct", name: "Scotland", nameCn: "苏格兰", group: "C",
    fifaRank: 39, coach: "Steve Clarke",
    players: [
      { pos: "GK", name: "Craig Gordon", age: 43, caps: 83, goals: 0, club: "Heart of Midlothian" },
      { pos: "GK", name: "Angus Gunn", age: 30, caps: 21, goals: 0, club: "Nottingham Forest" },
      { pos: "DF", name: "Andy Robertson", age: 32, caps: 92, goals: 4, club: "Liverpool", captain: true },
      { pos: "DF", name: "Grant Hanley", age: 34, caps: 66, goals: 2, club: "Hibernian" },
      { pos: "DF", name: "Kieran Tierney", age: 29, caps: 55, goals: 2, club: "Celtic" },
      { pos: "DF", name: "Scott McKenna", age: 29, caps: 49, goals: 1, club: "Dinamo Zagreb" },
      { pos: "DF", name: "Jack Hendry", age: 31, caps: 37, goals: 3, club: "Al-Ettifaq" },
      { pos: "MF", name: "John McGinn", age: 31, caps: 85, goals: 20, club: "Aston Villa" },
      { pos: "MF", name: "Scott McTominay", age: 29, caps: 69, goals: 14, club: "Napoli" },
      { pos: "MF", name: "Ryan Christie", age: 31, caps: 66, goals: 9, club: "Bournemouth" },
      { pos: "MF", name: "Kenny McLean", age: 34, caps: 56, goals: 3, club: "Norwich City" },
      { pos: "MF", name: "Billy Gilmour", age: 25, caps: 45, goals: 2, club: "Napoli" },
      { pos: "FW", name: "Lyndon Dykes", age: 30, caps: 50, goals: 10, club: "Charlton Athletic" },
      { pos: "FW", name: "Ché Adams", age: 29, caps: 46, goals: 11, club: "Torino" },
      { pos: "FW", name: "Lawrence Shankland", age: 30, caps: 18, goals: 4, club: "Heart of Midlothian" },
    ]
  },

  // ===== GROUP D =====
  {
    code: "au", name: "Australia", nameCn: "澳大利亚", group: "D",
    fifaRank: 24, coach: "Tony Popovic",
    players: []  // 名单待公布
  },
  {
    code: "py", name: "Paraguay", nameCn: "巴拉圭", group: "D",
    fifaRank: 55, coach: "Gustavo Alfaro",
    players: [
      { pos: "GK", name: "Gatito Fernández", age: 38, caps: 30, goals: 0, club: "Cerro Porteño" },
      { pos: "GK", name: "Carlos Coronel", age: 29, caps: 9, goals: 0, club: "São Paulo" },
      { pos: "DF", name: "Gustavo Gómez", age: 33, caps: 88, goals: 4, club: "Palmeiras", captain: true },
      { pos: "DF", name: "Júnior Alonso", age: 33, caps: 70, goals: 3, club: "Atlético Mineiro" },
      { pos: "DF", name: "Fabián Balbuena", age: 34, caps: 47, goals: 2, club: "Grêmio" },
      { pos: "DF", name: "Omar Alderete", age: 29, caps: 35, goals: 3, club: "Sunderland" },
      { pos: "MF", name: "Miguel Almirón", age: 32, caps: 75, goals: 9, club: "Atlanta United FC" },
      { pos: "MF", name: "Mathías Villasanti", age: 29, caps: 51, goals: 0, club: "Grêmio" },
      { pos: "MF", name: "Andrés Cubas", age: 30, caps: 32, goals: 0, club: "Vancouver Whitecaps FC" },
      { pos: "MF", name: "Ramón Sosa", age: 26, caps: 28, goals: 1, club: "Palmeiras" },
      { pos: "MF", name: "Diego Gómez", age: 23, caps: 23, goals: 3, club: "Brighton & Hove Albion" },
      { pos: "FW", name: "Óscar Romero", age: 33, caps: 55, goals: 4, club: "Huracán" },
      { pos: "FW", name: "Ángel Romero", age: 33, caps: 51, goals: 8, club: "Boca Juniors" },
      { pos: "FW", name: "Antonio Sanabria", age: 30, caps: 47, goals: 7, club: "Cremonese" },
      { pos: "FW", name: "Julio Enciso", age: 22, caps: 31, goals: 4, club: "Strasbourg" },
    ]
  },
  {
    code: "tr", name: "Turkey", nameCn: "土耳其", group: "D",
    fifaRank: 26, coach: "Vincenzo Montella",
    players: [
      { pos: "GK", name: "Uğurcan Çakır", age: 30, caps: 38, goals: 0, club: "Galatasaray" },
      { pos: "GK", name: "Mert Günok", age: 37, caps: 37, goals: 0, club: "Fenerbahçe" },
      { pos: "GK", name: "Altay Bayındır", age: 28, caps: 11, goals: 0, club: "Manchester United" },
      { pos: "DF", name: "Merih Demiral", age: 28, caps: 61, goals: 6, club: "Al-Ahli" },
      { pos: "DF", name: "Zeki Çelik", age: 29, caps: 59, goals: 3, club: "Roma" },
      { pos: "DF", name: "Çağlar Söyüncü", age: 30, caps: 59, goals: 2, club: "Fenerbahçe" },
      { pos: "DF", name: "Mert Müldür", age: 27, caps: 43, goals: 3, club: "Fenerbahçe" },
      { pos: "DF", name: "Ferdi Kadıoğlu", age: 26, caps: 30, goals: 2, club: "Brighton & Hove Albion" },
      { pos: "MF", name: "Hakan Çalhanoğlu", age: 32, caps: 104, goals: 22, club: "Inter Milan", captain: true },
      { pos: "MF", name: "Kaan Ayhan", age: 31, caps: 72, goals: 5, club: "Galatasaray" },
      { pos: "MF", name: "Orkun Kökçü", age: 25, caps: 48, goals: 3, club: "Beşiktaş" },
      { pos: "MF", name: "İsmail Yüksek", age: 27, caps: 31, goals: 1, club: "Fenerbahçe" },
      { pos: "FW", name: "Kerem Aktürkoğlu", age: 27, caps: 51, goals: 15, club: "Fenerbahçe" },
      { pos: "FW", name: "Barış Alper Yılmaz", age: 26, caps: 33, goals: 2, club: "Galatasaray" },
      { pos: "FW", name: "Arda Güler", age: 21, caps: 28, goals: 6, club: "Real Madrid" },
      { pos: "FW", name: "Kenan Yıldız", age: 21, caps: 28, goals: 5, club: "Juventus" },
    ]
  },
  {
    code: "us", name: "United States", nameCn: "美国", group: "D",
    fifaRank: 11, coach: "Mauricio Pochettino",
    players: [
      { pos: "GK", name: "Matt Turner", age: 31, caps: 53, goals: 0, club: "New England Revolution" },
      { pos: "GK", name: "Matt Freese", age: 27, caps: 14, goals: 0, club: "New York City FC" },
      { pos: "DF", name: "Sergiño Dest", age: 25, caps: 37, goals: 2, club: "PSV Eindhoven" },
      { pos: "DF", name: "Chris Richards", age: 26, caps: 36, goals: 3, club: "Crystal Palace" },
      { pos: "DF", name: "Antonee Robinson", age: 28, caps: 52, goals: 4, club: "Fulham" },
      { pos: "DF", name: "Tim Ream", age: 38, caps: 80, goals: 1, club: "Charlotte FC" },
      { pos: "DF", name: "Miles Robinson", age: 29, caps: 38, goals: 3, club: "FC Cincinnati" },
      { pos: "MF", name: "Tyler Adams", age: 27, caps: 52, goals: 2, club: "Bournemouth" },
      { pos: "MF", name: "Weston McKennie", age: 27, caps: 64, goals: 12, club: "Juventus" },
      { pos: "MF", name: "Giovanni Reyna", age: 23, caps: 36, goals: 9, club: "Borussia Mönchengladbach" },
      { pos: "MF", name: "Cristian Roldan", age: 31, caps: 45, goals: 0, club: "Seattle Sounders FC" },
      { pos: "MF", name: "Malik Tillman", age: 24, caps: 28, goals: 3, club: "Bayer Leverkusen" },
      { pos: "FW", name: "Christian Pulisic", age: 27, caps: 84, goals: 32, club: "Milan", captain: true },
      { pos: "FW", name: "Brenden Aaronson", age: 25, caps: 57, goals: 9, club: "Leeds United" },
      { pos: "FW", name: "Ricardo Pepi", age: 23, caps: 35, goals: 13, club: "PSV Eindhoven" },
      { pos: "FW", name: "Folarin Balogun", age: 24, caps: 25, goals: 8, club: "Monaco" },
      { pos: "FW", name: "Timothy Weah", age: 26, caps: 49, goals: 7, club: "Marseille" },
    ]
  },

  // ===== GROUP E =====
  {
    code: "cw", name: "Curaçao", nameCn: "库拉索", group: "E",
    fifaRank: 81, coach: "Dick Advocaat",
    players: [
      { pos: "GK", name: "Eloy Room", age: 37, caps: 70, goals: 0, club: "Miami FC" },
      { pos: "DF", name: "Juriën Gaari", age: 32, caps: 58, goals: 1, club: "Abha" },
      { pos: "DF", name: "Roshon van Eijma", age: 28, caps: 27, goals: 1, club: "RKC Waalwijk" },
      { pos: "DF", name: "Sherel Floranus", age: 27, caps: 26, goals: 0, club: "PEC Zwolle" },
      { pos: "MF", name: "Leandro Bacuna", age: 34, caps: 70, goals: 16, club: "Iğdır", captain: true },
      { pos: "MF", name: "Juninho Bacuna", age: 28, caps: 47, goals: 14, club: "Volendam" },
      { pos: "MF", name: "Godfried Roemeratoe", age: 26, caps: 26, goals: 1, club: "RKC Waalwijk" },
      { pos: "MF", name: "Livano Comenencia", age: 22, caps: 18, goals: 1, club: "Zürich" },
      { pos: "FW", name: "Kenji Gorré", age: 31, caps: 37, goals: 6, club: "Maccabi Haifa" },
      { pos: "FW", name: "Gervane Kastaneer", age: 30, caps: 27, goals: 9, club: "Terengganu" },
      { pos: "FW", name: "Jearl Margaritha", age: 26, caps: 21, goals: 5, club: "Beveren" },
      { pos: "FW", name: "Brandley Kuwas", age: 33, caps: 34, goals: 2, club: "Volendam" },
      { pos: "FW", name: "Tahith Chong", age: 26, caps: 4, goals: 2, club: "Sheffield United" },
    ]
  },
  {
    code: "ec", name: "Ecuador", nameCn: "厄瓜多尔", group: "E",
    fifaRank: 44, coach: "Sebastián Beccacece",
    players: []  // 名单待公布
  },
  {
    code: "de", name: "Germany", nameCn: "德国", group: "E",
    fifaRank: 12, coach: "Julian Nagelsmann",
    players: [
      { pos: "GK", name: "Manuel Neuer", age: 40, caps: 124, goals: 0, club: "Bayern Munich" },
      { pos: "GK", name: "Oliver Baumann", age: 36, caps: 11, goals: 0, club: "TSG Hoffenheim" },
      { pos: "DF", name: "Antonio Rüdiger", age: 33, caps: 82, goals: 3, club: "Real Madrid" },
      { pos: "DF", name: "Waldemar Anton", age: 29, caps: 12, goals: 0, club: "Borussia Dortmund" },
      { pos: "DF", name: "Jonathan Tah", age: 30, caps: 45, goals: 1, club: "Bayern Munich" },
      { pos: "DF", name: "Nico Schlotterbeck", age: 26, caps: 25, goals: 0, club: "Borussia Dortmund" },
      { pos: "DF", name: "David Raum", age: 28, caps: 36, goals: 1, club: "RB Leipzig" },
      { pos: "MF", name: "Joshua Kimmich", age: 31, caps: 108, goals: 10, club: "Bayern Munich", captain: true },
      { pos: "MF", name: "Leon Goretzka", age: 31, caps: 69, goals: 15, club: "Bayern Munich" },
      { pos: "MF", name: "Jamal Musiala", age: 23, caps: 40, goals: 8, club: "Bayern Munich" },
      { pos: "MF", name: "Florian Wirtz", age: 23, caps: 39, goals: 10, club: "Liverpool" },
      { pos: "MF", name: "Leroy Sané", age: 30, caps: 74, goals: 16, club: "Galatasaray" },
      { pos: "MF", name: "Aleksandar Pavlović", age: 22, caps: 9, goals: 1, club: "Bayern Munich" },
      { pos: "FW", name: "Kai Havertz", age: 27, caps: 57, goals: 21, club: "Arsenal" },
      { pos: "FW", name: "Nick Woltemade", age: 24, caps: 10, goals: 4, club: "Newcastle United" },
      { pos: "FW", name: "Maximilian Beier", age: 23, caps: 7, goals: 0, club: "Borussia Dortmund" },
      { pos: "FW", name: "Deniz Undav", age: 29, caps: 7, goals: 4, club: "VfB Stuttgart" },
    ]
  },
  {
    code: "ci", name: "Ivory Coast", nameCn: "科特迪瓦", group: "E",
    fifaRank: 48, coach: "Emerse Faé",
    players: [
      { pos: "GK", name: "Yahia Fofana", age: 25, caps: 34, goals: 0, club: "Çaykur Rizespor" },
      { pos: "DF", name: "Ghislain Konan", age: 30, caps: 53, goals: 0, club: "Gil Vicente" },
      { pos: "DF", name: "Odilon Kossounou", age: 25, caps: 35, goals: 0, club: "Atalanta" },
      { pos: "DF", name: "Wilfried Singo", age: 25, caps: 33, goals: 1, club: "Galatasaray" },
      { pos: "DF", name: "Evan Ndicka", age: 26, caps: 28, goals: 0, club: "Roma" },
      { pos: "DF", name: "Emmanuel Agbadou", age: 29, caps: 19, goals: 2, club: "Beşiktaş" },
      { pos: "DF", name: "Ousmane Diomande", age: 22, caps: 14, goals: 1, club: "Sporting CP" },
      { pos: "MF", name: "Franck Kessié", age: 29, caps: 78, goals: 20, club: "Al-Ahli" },
      { pos: "MF", name: "Jean Michaël Seri", age: 34, caps: 65, goals: 4, club: "Maribor" },
      { pos: "MF", name: "Ibrahim Sangaré", age: 28, caps: 57, goals: 12, club: "Nottingham Forest" },
      { pos: "MF", name: "Seko Fofana", age: 31, caps: 31, goals: 7, club: "Porto" },
      { pos: "FW", name: "Nicolas Pépé", age: 31, caps: 54, goals: 12, club: "Villarreal" },
      { pos: "FW", name: "Oumar Diakité", age: 22, caps: 28, goals: 6, club: "Cercle Brugge" },
      { pos: "FW", name: "Simon Adingra", age: 24, caps: 28, goals: 5, club: "Monaco" },
      { pos: "FW", name: "Amad Diallo", age: 23, caps: 18, goals: 5, club: "Manchester United" },
    ]
  },

  // ===== GROUP F =====
  {
    code: "jp", name: "Japan", nameCn: "日本", group: "F",
    fifaRank: 15, coach: "Hajime Moriyasu",
    players: [
      { pos: "GK", name: "Zion Suzuki", age: 23, caps: 23, goals: 0, club: "Parma" },
      { pos: "GK", name: "Keisuke Ōsako", age: 26, caps: 11, goals: 0, club: "Sanfrecce Hiroshima" },
      { pos: "DF", name: "Yukinari Sugawara", age: 25, caps: 20, goals: 2, club: "Werder Bremen" },
      { pos: "DF", name: "Shōgo Taniguchi", age: 34, caps: 37, goals: 1, club: "Sint-Truiden" },
      { pos: "DF", name: "Kō Itakura", age: 29, caps: 39, goals: 2, club: "Ajax" },
      { pos: "DF", name: "Yūto Nagatomo", age: 39, caps: 144, goals: 4, club: "FC Tokyo" },
      { pos: "DF", name: "Takehiro Tomiyasu", age: 27, caps: 42, goals: 1, club: "Ajax" },
      { pos: "DF", name: "Hiroki Itō", age: 27, caps: 23, goals: 1, club: "Bayern Munich" },
      { pos: "MF", name: "Wataru Endo", age: 33, caps: 72, goals: 4, club: "Liverpool", captain: true },
      { pos: "MF", name: "Ao Tanaka", age: 27, caps: 37, goals: 8, club: "Leeds United" },
      { pos: "MF", name: "Takefusa Kubo", age: 25, caps: 48, goals: 7, club: "Real Sociedad" },
      { pos: "MF", name: "Ritsu Dōan", age: 27, caps: 64, goals: 11, club: "Eintracht Frankfurt" },
      { pos: "MF", name: "Junya Itō", age: 33, caps: 68, goals: 15, club: "Genk" },
      { pos: "MF", name: "Daichi Kamada", age: 29, caps: 49, goals: 12, club: "Crystal Palace" },
      { pos: "FW", name: "Daizen Maeda", age: 28, caps: 27, goals: 4, club: "Celtic" },
      { pos: "FW", name: "Ayase Ueda", age: 27, caps: 38, goals: 16, club: "Feyenoord" },
      { pos: "FW", name: "Kōki Ogawa", age: 28, caps: 14, goals: 10, club: "NEC" },
    ]
  },
  {
    code: "nl", name: "Netherlands", nameCn: "荷兰", group: "F",
    fifaRank: 7, coach: "Ronald Koeman",
    players: [
      { pos: "GK", name: "Bart Verbruggen", age: 23, caps: 27, goals: 0, club: "Brighton & Hove Albion" },
      { pos: "GK", name: "Mark Flekken", age: 32, caps: 11, goals: 0, club: "Bayer Leverkusen" },
      { pos: "DF", name: "Virgil van Dijk", age: 34, caps: 90, goals: 12, club: "Liverpool", captain: true },
      { pos: "DF", name: "Denzel Dumfries", age: 30, caps: 71, goals: 11, club: "Inter Milan" },
      { pos: "DF", name: "Nathan Aké", age: 31, caps: 58, goals: 5, club: "Manchester City" },
      { pos: "DF", name: "Jurriën Timber", age: 24, caps: 23, goals: 0, club: "Arsenal" },
      { pos: "DF", name: "Micky van de Ven", age: 25, caps: 19, goals: 1, club: "Tottenham Hotspur" },
      { pos: "MF", name: "Frenkie de Jong", age: 29, caps: 64, goals: 2, club: "Barcelona" },
      { pos: "MF", name: "Tijjani Reijnders", age: 27, caps: 30, goals: 7, club: "Manchester City" },
      { pos: "MF", name: "Teun Koopmeiners", age: 28, caps: 27, goals: 3, club: "Juventus" },
      { pos: "MF", name: "Ryan Gravenberch", age: 24, caps: 25, goals: 1, club: "Liverpool" },
      { pos: "MF", name: "Marten de Roon", age: 35, caps: 42, goals: 1, club: "Atalanta" },
      { pos: "FW", name: "Memphis Depay", age: 32, caps: 108, goals: 55, club: "Corinthians" },
      { pos: "FW", name: "Cody Gakpo", age: 27, caps: 48, goals: 19, club: "Liverpool" },
      { pos: "FW", name: "Donyell Malen", age: 27, caps: 51, goals: 13, club: "Roma" },
      { pos: "FW", name: "Wout Weghorst", age: 33, caps: 51, goals: 14, club: "Ajax" },
      { pos: "FW", name: "Noa Lang", age: 26, caps: 15, goals: 3, club: "Galatasaray" },
    ]
  },
  {
    code: "se", name: "Sweden", nameCn: "瑞典", group: "F",
    fifaRank: 25, coach: "Graham Potter",
    players: [
      { pos: "GK", name: "Jacob Widell Zetterström", age: 27, caps: 2, goals: 0, club: "Derby County" },
      { pos: "GK", name: "Viktor Johansson", age: 27, caps: 12, goals: 0, club: "Stoke City" },
      { pos: "DF", name: "Victor Lindelöf", age: 31, caps: 75, goals: 3, club: "Aston Villa", captain: true },
      { pos: "DF", name: "Isak Hien", age: 27, caps: 27, goals: 0, club: "Atalanta" },
      { pos: "DF", name: "Gabriel Gudmundsson", age: 27, caps: 23, goals: 0, club: "Leeds United" },
      { pos: "DF", name: "Emil Holm", age: 26, caps: 16, goals: 2, club: "Juventus" },
      { pos: "DF", name: "Carl Starfelt", age: 31, caps: 17, goals: 0, club: "Celta Vigo" },
      { pos: "MF", name: "Ken Sema", age: 32, caps: 32, goals: 5, club: "Pafos" },
      { pos: "MF", name: "Jesper Karlström", age: 30, caps: 23, goals: 0, club: "Udinese" },
      { pos: "MF", name: "Mattias Svanberg", age: 27, caps: 39, goals: 2, club: "VfL Wolfsburg" },
      { pos: "MF", name: "Lucas Bergvall", age: 20, caps: 8, goals: 0, club: "Tottenham Hotspur" },
      { pos: "FW", name: "Viktor Gyökeres", age: 28, caps: 32, goals: 19, club: "Arsenal" },
      { pos: "FW", name: "Alexander Isak", age: 26, caps: 56, goals: 16, club: "Liverpool" },
      { pos: "FW", name: "Anthony Elanga", age: 24, caps: 28, goals: 6, club: "Newcastle United" },
      { pos: "FW", name: "Benjamin Nygren", age: 24, caps: 9, goals: 3, club: "Celtic" },
    ]
  },
  {
    code: "tn", name: "Tunisia", nameCn: "突尼斯", group: "F",
    fifaRank: 30, coach: "Sabri Lamouchi",
    players: [
      { pos: "GK", name: "Aymen Dahmen", age: 29, caps: 37, goals: 0, club: "CS Sfaxien" },
      { pos: "DF", name: "Montassar Talbi", age: 28, caps: 62, goals: 4, club: "Lorient" },
      { pos: "DF", name: "Dylan Bronn", age: 30, caps: 52, goals: 2, club: "Servette" },
      { pos: "DF", name: "Ali Abdi", age: 32, caps: 45, goals: 7, club: "Nice" },
      { pos: "DF", name: "Yan Valery", age: 27, caps: 21, goals: 0, club: "Young Boys" },
      { pos: "MF", name: "Ellyes Skhiri", age: 31, caps: 81, goals: 4, club: "Eintracht Frankfurt", captain: true },
      { pos: "MF", name: "Hannibal Mejbri", age: 23, caps: 44, goals: 1, club: "Burnley" },
      { pos: "MF", name: "Anis Ben Slimane", age: 25, caps: 39, goals: 4, club: "Norwich City" },
      { pos: "MF", name: "Ismaël Gharbi", age: 22, caps: 15, goals: 2, club: "FC Augsburg" },
      { pos: "FW", name: "Elias Achouri", age: 27, caps: 29, goals: 4, club: "Copenhagen" },
      { pos: "FW", name: "Firas Chaouat", age: 30, caps: 28, goals: 6, club: "Club Africain" },
      { pos: "FW", name: "Hazem Mastouri", age: 28, caps: 18, goals: 4, club: "Dynamo Makhachkala" },
      { pos: "FW", name: "Elias Saad", age: 26, caps: 14, goals: 4, club: "Hannover 96" },
    ]
  },

  // ===== GROUP G =====
  {
    code: "be", name: "Belgium", nameCn: "比利时", group: "G",
    fifaRank: 3, coach: "Rudi Garcia",
    players: [
      { pos: "GK", name: "Thibaut Courtois", age: 34, caps: 107, goals: 0, club: "Real Madrid" },
      { pos: "DF", name: "Thomas Meunier", age: 34, caps: 78, goals: 10, club: "Lille" },
      { pos: "DF", name: "Timothy Castagne", age: 30, caps: 62, goals: 2, club: "Fulham" },
      { pos: "DF", name: "Arthur Theate", age: 26, caps: 32, goals: 1, club: "Eintracht Frankfurt" },
      { pos: "DF", name: "Zeno Debast", age: 22, caps: 26, goals: 1, club: "Sporting CP" },
      { pos: "DF", name: "Maxim De Cuyper", age: 25, caps: 17, goals: 4, club: "Brighton & Hove Albion" },
      { pos: "MF", name: "Axel Witsel", age: 37, caps: 136, goals: 12, club: "Girona" },
      { pos: "MF", name: "Kevin De Bruyne", age: 34, caps: 117, goals: 36, club: "Napoli" },
      { pos: "MF", name: "Youri Tielemans", age: 29, caps: 83, goals: 12, club: "Aston Villa", captain: true },
      { pos: "MF", name: "Hans Vanaken", age: 33, caps: 32, goals: 7, club: "Club Brugge" },
      { pos: "MF", name: "Amadou Onana", age: 24, caps: 27, goals: 1, club: "Aston Villa" },
      { pos: "FW", name: "Romelu Lukaku", age: 33, caps: 124, goals: 89, club: "Napoli" },
      { pos: "FW", name: "Leandro Trossard", age: 31, caps: 50, goals: 11, club: "Arsenal" },
      { pos: "FW", name: "Jérémy Doku", age: 24, caps: 41, goals: 7, club: "Manchester City" },
      { pos: "FW", name: "Charles De Ketelaere", age: 25, caps: 28, goals: 5, club: "Atalanta" },
    ]
  },
  {
    code: "eg", name: "Egypt", nameCn: "埃及", group: "G",
    fifaRank: 34, coach: "Hossam Hassan",
    players: [
      { pos: "GK", name: "Mohamed El Shenawy", age: 37, caps: 76, goals: 0, club: "Al Ahly" },
      { pos: "GK", name: "Mostafa Shobeir", age: 26, caps: 8, goals: 0, club: "Al Ahly" },
      { pos: "DF", name: "Hamdy Fathy", age: 31, caps: 62, goals: 3, club: "Al-Wakrah" },
      { pos: "DF", name: "Ramy Rabia", age: 33, caps: 44, goals: 5, club: "Al Ain" },
      { pos: "DF", name: "Mohamed Hany", age: 30, caps: 41, goals: 0, club: "Al Ahly" },
      { pos: "DF", name: "Ahmed Fatouh", age: 28, caps: 38, goals: 1, club: "Zamalek" },
      { pos: "DF", name: "Mohamed Abdelmonem", age: 27, caps: 35, goals: 3, club: "Nice" },
      { pos: "MF", name: "Marwan Attia", age: 27, caps: 33, goals: 1, club: "Al Ahly" },
      { pos: "MF", name: "Emam Ashour", age: 28, caps: 28, goals: 0, club: "Al Ahly" },
      { pos: "MF", name: "Mohanad Lasheen", age: 30, caps: 22, goals: 0, club: "Pyramids" },
      { pos: "FW", name: "Mohamed Salah", age: 33, caps: 116, goals: 67, club: "Liverpool", captain: true },
      { pos: "FW", name: "Trézéguet", age: 31, caps: 95, goals: 23, club: "Al Ahly" },
      { pos: "FW", name: "Omar Marmoush", age: 27, caps: 48, goals: 11, club: "Manchester City" },
      { pos: "FW", name: "Ibrahim Adel", age: 25, caps: 23, goals: 3, club: "Nordsjælland" },
    ]
  },
  {
    code: "ir", name: "Iran", nameCn: "伊朗", group: "G",
    fifaRank: 21, coach: "Amir Ghalenoei",
    players: [
      { pos: "GK", name: "Alireza Beiranvand", age: 33, caps: 84, goals: 0, club: "Tractor" },
      { pos: "DF", name: "Ehsan Hajsafi", age: 36, caps: 144, goals: 7, club: "Sepahan" },
      { pos: "DF", name: "Milad Mohammadi", age: 32, caps: 75, goals: 1, club: "Persepolis" },
      { pos: "DF", name: "Ramin Rezaeian", age: 36, caps: 72, goals: 6, club: "Foolad" },
      { pos: "DF", name: "Hossein Kanaanizadegan", age: 32, caps: 63, goals: 6, club: "Persepolis" },
      { pos: "MF", name: "Alireza Jahanbakhsh", age: 32, caps: 98, goals: 17, club: "Dender", captain: true },
      { pos: "MF", name: "Saeid Ezatolahi", age: 29, caps: 81, goals: 1, club: "Shabab Al-Ahli" },
      { pos: "MF", name: "Saman Ghoddos", age: 32, caps: 67, goals: 3, club: "Kalba" },
      { pos: "MF", name: "Mehdi Torabi", age: 31, caps: 51, goals: 7, club: "Tractor" },
      { pos: "MF", name: "Rouzbeh Cheshmi", age: 32, caps: 40, goals: 3, club: "Esteghlal" },
      { pos: "FW", name: "Mehdi Taremi", age: 33, caps: 103, goals: 59, club: "Olympiacos" },
      { pos: "FW", name: "Mehdi Ghayedi", age: 27, caps: 29, goals: 10, club: "Al-Nasr" },
      { pos: "FW", name: "Amirhossein Hosseinzadeh", age: 25, caps: 16, goals: 5, club: "Tractor" },
    ]
  },
  {
    code: "nz", name: "New Zealand", nameCn: "新西兰", group: "G",
    fifaRank: 93, coach: "Darren Bazeley",
    players: [
      { pos: "GK", name: "Max Crocombe", age: 32, caps: 22, goals: 0, club: "Millwall" },
      { pos: "DF", name: "Tim Payne", age: 32, caps: 49, goals: 3, club: "Wellington Phoenix" },
      { pos: "DF", name: "Michael Boxall", age: 37, caps: 61, goals: 1, club: "Minnesota United FC" },
      { pos: "DF", name: "Liberato Cacace", age: 25, caps: 35, goals: 1, club: "Wrexham" },
      { pos: "MF", name: "Joe Bell", age: 27, caps: 31, goals: 1, club: "Viking" },
      { pos: "MF", name: "Matthew Garbett", age: 24, caps: 35, goals: 5, club: "Peterborough United" },
      { pos: "MF", name: "Marko Stamenić", age: 24, caps: 37, goals: 3, club: "Swansea City" },
      { pos: "MF", name: "Sarpreet Singh", age: 27, caps: 26, goals: 3, club: "Wellington Phoenix" },
      { pos: "MF", name: "Elijah Just", age: 26, caps: 42, goals: 9, club: "Motherwell" },
      { pos: "FW", name: "Chris Wood", age: 34, caps: 88, goals: 45, club: "Nottingham Forest", captain: true },
      { pos: "FW", name: "Kosta Barbarouses", age: 36, caps: 74, goals: 10, club: "Western Sydney Wanderers" },
      { pos: "FW", name: "Ben Waine", age: 24, caps: 22, goals: 5, club: "Brøndby" },
    ]
  },

  // ===== GROUP H =====
  {
    code: "cv", name: "Cape Verde", nameCn: "佛得角", group: "H",
    fifaRank: 50, coach: "Bubista",
    players: [
      { pos: "GK", name: "Vozinha", age: 40, caps: 85, goals: 0, club: "Chaves" },
      { pos: "DF", name: "Stopira", age: 38, caps: 60, goals: 4, club: "Torreense" },
      { pos: "DF", name: "Roberto Lopes", age: 33, caps: 44, goals: 0, club: "Shamrock Rovers" },
      { pos: "DF", name: "João Paulo", age: 28, caps: 40, goals: 1, club: "FCSB" },
      { pos: "DF", name: "Logan Costa", age: 25, caps: 26, goals: 0, club: "Villarreal" },
      { pos: "MF", name: "Jamiro Monteiro", age: 32, caps: 53, goals: 5, club: "PEC Zwolle" },
      { pos: "MF", name: "Kevin Pina", age: 29, caps: 30, goals: 2, club: "Krasnodar" },
      { pos: "MF", name: "Deroy Duarte", age: 26, caps: 30, goals: 0, club: "Ludogorets Razgrad" },
      { pos: "FW", name: "Ryan Mendes", age: 36, caps: 94, goals: 22, club: "Iğdır", captain: true },
      { pos: "FW", name: "Garry Rodrigues", age: 35, caps: 59, goals: 9, club: "Apollon Limassol" },
      { pos: "FW", name: "Jovane Cabral", age: 27, caps: 25, goals: 2, club: "Estrela Amadora" },
      { pos: "FW", name: "Dailon Livramento", age: 25, caps: 20, goals: 7, club: "Casa Pia" },
    ]
  },
  {
    code: "sa", name: "Saudi Arabia", nameCn: "沙特阿拉伯", group: "H",
    fifaRank: 56, coach: "Georgios Donis",
    players: [
      { pos: "GK", name: "Mohammed Al-Owais", age: 34, caps: 62, goals: 0, club: "Al-Ula" },
      { pos: "DF", name: "Saud Abdulhamid", age: 26, caps: 53, goals: 1, club: "Lens" },
      { pos: "DF", name: "Hassan Al-Tambakti", age: 27, caps: 50, goals: 0, club: "Al-Hilal" },
      { pos: "DF", name: "Abdulelah Al-Amri", age: 29, caps: 40, goals: 1, club: "Al-Nassr" },
      { pos: "DF", name: "Nawaf Boushal", age: 26, caps: 23, goals: 0, club: "Al-Nassr" },
      { pos: "MF", name: "Salem Al-Dawsari", age: 34, caps: 107, goals: 26, club: "Al-Hilal", captain: true },
      { pos: "MF", name: "Mohamed Kanno", age: 31, caps: 74, goals: 8, club: "Al-Hilal" },
      { pos: "MF", name: "Nasser Al-Dawsari", age: 27, caps: 41, goals: 0, club: "Al-Hilal" },
      { pos: "MF", name: "Abdullah Al-Khaibari", age: 29, caps: 37, goals: 0, club: "Al-Nassr" },
      { pos: "MF", name: "Musab Al-Juwayr", age: 22, caps: 32, goals: 6, club: "Al-Qadsiah" },
      { pos: "FW", name: "Firas Al-Buraikan", age: 26, caps: 68, goals: 15, club: "Al-Ahli" },
      { pos: "FW", name: "Saleh Al-Shehri", age: 32, caps: 55, goals: 18, club: "Al-Ittihad" },
      { pos: "FW", name: "Abdullah Al-Hamdan", age: 26, caps: 47, goals: 11, club: "Al-Nassr" },
    ]
  },
  {
    code: "es", name: "Spain", nameCn: "西班牙", group: "H",
    fifaRank: 2, coach: "Luis de la Fuente",
    players: [
      { pos: "GK", name: "Unai Simón", age: 29, caps: 57, goals: 0, club: "Athletic Bilbao" },
      { pos: "GK", name: "David Raya", age: 30, caps: 12, goals: 0, club: "Arsenal" },
      { pos: "DF", name: "Aymeric Laporte", age: 32, caps: 44, goals: 2, club: "Athletic Bilbao" },
      { pos: "DF", name: "Marc Cucurella", age: 27, caps: 23, goals: 1, club: "Chelsea" },
      { pos: "DF", name: "Eric García", age: 25, caps: 19, goals: 0, club: "Barcelona" },
      { pos: "DF", name: "Pedro Porro", age: 26, caps: 16, goals: 0, club: "Tottenham Hotspur" },
      { pos: "DF", name: "Álex Grimaldo", age: 30, caps: 12, goals: 0, club: "Bayer Leverkusen" },
      { pos: "DF", name: "Pau Cubarsí", age: 19, caps: 11, goals: 0, club: "Barcelona" },
      { pos: "MF", name: "Rodri", age: 29, caps: 61, goals: 4, club: "Manchester City", captain: true },
      { pos: "MF", name: "Mikel Merino", age: 29, caps: 41, goals: 10, club: "Arsenal" },
      { pos: "MF", name: "Fabián Ruiz", age: 30, caps: 41, goals: 6, club: "Paris Saint-Germain" },
      { pos: "MF", name: "Pedri", age: 23, caps: 40, goals: 5, club: "Barcelona" },
      { pos: "MF", name: "Gavi", age: 21, caps: 28, goals: 5, club: "Barcelona" },
      { pos: "MF", name: "Martín Zubimendi", age: 27, caps: 25, goals: 3, club: "Arsenal" },
      { pos: "FW", name: "Ferran Torres", age: 26, caps: 55, goals: 23, club: "Barcelona" },
      { pos: "FW", name: "Mikel Oyarzabal", age: 29, caps: 52, goals: 24, club: "Real Sociedad" },
      { pos: "FW", name: "Dani Olmo", age: 28, caps: 48, goals: 12, club: "Barcelona" },
      { pos: "FW", name: "Nico Williams", age: 23, caps: 30, goals: 6, club: "Athletic Bilbao" },
      { pos: "FW", name: "Lamine Yamal", age: 18, caps: 25, goals: 6, club: "Barcelona" },
    ]
  },
  {
    code: "uy", name: "Uruguay", nameCn: "乌拉圭", group: "H",
    fifaRank: 17, coach: "Marcelo Bielsa",
    players: []  // 名单待公布
  },

  // ===== GROUP I =====
  {
    code: "fr", name: "France", nameCn: "法国", group: "I",
    fifaRank: 4, coach: "Didier Deschamps",
    players: [
      { pos: "GK", name: "Brice Samba", age: 32, caps: 4, goals: 0, club: "Rennes" },
      { pos: "GK", name: "Mike Maignan", age: 30, caps: 38, goals: 0, club: "Milan" },
      { pos: "DF", name: "Malo Gusto", age: 23, caps: 9, goals: 0, club: "Chelsea" },
      { pos: "DF", name: "Lucas Digne", age: 32, caps: 56, goals: 0, club: "Aston Villa" },
      { pos: "DF", name: "Dayot Upamecano", age: 27, caps: 36, goals: 2, club: "Bayern Munich" },
      { pos: "DF", name: "Jules Koundé", age: 27, caps: 46, goals: 0, club: "Barcelona" },
      { pos: "DF", name: "Ibrahima Konaté", age: 27, caps: 27, goals: 0, club: "Liverpool" },
      { pos: "DF", name: "William Saliba", age: 25, caps: 31, goals: 0, club: "Arsenal" },
      { pos: "DF", name: "Théo Hernandez", age: 28, caps: 42, goals: 2, club: "Al-Hilal" },
      { pos: "MF", name: "Aurélien Tchouaméni", age: 26, caps: 44, goals: 3, club: "Real Madrid" },
      { pos: "MF", name: "N'Golo Kanté", age: 35, caps: 67, goals: 2, club: "Fenerbahçe" },
      { pos: "MF", name: "Adrien Rabiot", age: 31, caps: 57, goals: 7, club: "Milan" },
      { pos: "MF", name: "Manu Koné", age: 25, caps: 12, goals: 0, club: "Roma" },
      { pos: "FW", name: "Kylian Mbappé", age: 27, caps: 96, goals: 56, club: "Real Madrid", captain: true },
      { pos: "FW", name: "Ousmane Dembélé", age: 29, caps: 58, goals: 7, club: "Paris Saint-Germain" },
      { pos: "FW", name: "Marcus Thuram", age: 28, caps: 33, goals: 3, club: "Inter Milan" },
      { pos: "FW", name: "Michael Olise", age: 24, caps: 15, goals: 4, club: "Bayern Munich" },
      { pos: "FW", name: "Bradley Barcola", age: 23, caps: 18, goals: 3, club: "Paris Saint-Germain" },
    ]
  },
  {
    code: "iq", name: "Iraq", nameCn: "伊拉克", group: "I",
    fifaRank: 68, coach: "Graham Arnold",
    players: [
      { pos: "GK", name: "Jalal Hassan", age: 35, caps: 100, goals: 0, club: "Al-Zawraa", captain: true },
      { pos: "DF", name: "Rebin Sulaka", age: 34, caps: 54, goals: 1, club: "Port" },
      { pos: "DF", name: "Manaf Younis", age: 29, caps: 31, goals: 1, club: "Al-Shorta" },
      { pos: "DF", name: "Merchas Doski", age: 26, caps: 30, goals: 0, club: "Viktoria Plzeň" },
      { pos: "DF", name: "Hussein Ali", age: 24, caps: 25, goals: 1, club: "Pogoń Szczecin" },
      { pos: "MF", name: "Ibrahim Bayesh", age: 26, caps: 74, goals: 8, club: "Al-Dhafra" },
      { pos: "MF", name: "Amir Al-Ammari", age: 28, caps: 49, goals: 3, club: "Cracovia" },
      { pos: "MF", name: "Ali Jasim", age: 22, caps: 35, goals: 2, club: "Al-Najma" },
      { pos: "MF", name: "Youssef Amyn", age: 22, caps: 25, goals: 2, club: "AEK Larnaca" },
      { pos: "MF", name: "Zidane Iqbal", age: 23, caps: 22, goals: 2, club: "Utrecht" },
      { pos: "FW", name: "Aymen Hussein", age: 30, caps: 93, goals: 33, club: "Al-Karma" },
      { pos: "FW", name: "Mohanad Ali", age: 25, caps: 70, goals: 27, club: "Dibba" },
      { pos: "FW", name: "Ali Al-Hamadi", age: 24, caps: 17, goals: 5, club: "Luton Town" },
    ]
  },
  {
    code: "no", name: "Norway", nameCn: "挪威", group: "I",
    fifaRank: 10, coach: "Ståle Solbakken",
    players: [
      { pos: "GK", name: "Ørjan Nyland", age: 35, caps: 69, goals: 0, club: "Sevilla" },
      { pos: "GK", name: "Egil Selvik", age: 28, caps: 6, goals: 0, club: "Watford" },
      { pos: "DF", name: "Kristoffer Ajer", age: 28, caps: 50, goals: 2, club: "Brentford" },
      { pos: "DF", name: "Leo Østigård", age: 26, caps: 36, goals: 1, club: "Genoa" },
      { pos: "DF", name: "Marcus Holmgren Pedersen", age: 25, caps: 31, goals: 0, club: "Torino" },
      { pos: "DF", name: "Julian Ryerson", age: 28, caps: 41, goals: 1, club: "Borussia Dortmund" },
      { pos: "MF", name: "Martin Ødegaard", age: 27, caps: 67, goals: 4, club: "Arsenal", captain: true },
      { pos: "MF", name: "Sander Berge", age: 28, caps: 64, goals: 1, club: "Fulham" },
      { pos: "MF", name: "Morten Thorsby", age: 30, caps: 30, goals: 0, club: "Cremonese" },
      { pos: "MF", name: "Kristian Thorstvedt", age: 27, caps: 35, goals: 4, club: "Sassuolo" },
      { pos: "MF", name: "Antonio Nusa", age: 21, caps: 22, goals: 7, club: "RB Leipzig" },
      { pos: "FW", name: "Erling Haaland", age: 25, caps: 49, goals: 55, club: "Manchester City" },
      { pos: "FW", name: "Alexander Sørloth", age: 30, caps: 70, goals: 26, club: "Atlético Madrid" },
      { pos: "FW", name: "Jørgen Strand Larsen", age: 26, caps: 26, goals: 4, club: "Crystal Palace" },
    ]
  },
  {
    code: "sn", name: "Senegal", nameCn: "塞内加尔", group: "I",
    fifaRank: 20, coach: "Pape Thiaw",
    players: [
      { pos: "GK", name: "Édouard Mendy", age: 34, caps: 56, goals: 0, club: "Al-Ahli" },
      { pos: "DF", name: "Kalidou Koulibaly", age: 34, caps: 103, goals: 2, club: "Al-Hilal", captain: true },
      { pos: "DF", name: "Krépin Diatta", age: 27, caps: 59, goals: 2, club: "Monaco" },
      { pos: "DF", name: "Moussa Niakhaté", age: 30, caps: 29, goals: 0, club: "Lyon" },
      { pos: "DF", name: "Ismail Jakobs", age: 26, caps: 28, goals: 0, club: "Galatasaray" },
      { pos: "DF", name: "El Hadji Malick Diouf", age: 21, caps: 18, goals: 1, club: "West Ham United" },
      { pos: "MF", name: "Idrissa Gueye", age: 36, caps: 131, goals: 7, club: "Everton" },
      { pos: "MF", name: "Pape Gueye", age: 27, caps: 40, goals: 5, club: "Villarreal" },
      { pos: "MF", name: "Pape Matar Sarr", age: 23, caps: 38, goals: 4, club: "Tottenham Hotspur" },
      { pos: "MF", name: "Lamine Camara", age: 22, caps: 25, goals: 7, club: "Monaco" },
      { pos: "FW", name: "Sadio Mané", age: 34, caps: 126, goals: 53, club: "Al-Nassr" },
      { pos: "FW", name: "Ismaïla Sarr", age: 28, caps: 83, goals: 19, club: "Crystal Palace" },
      { pos: "FW", name: "Iliman Ndiaye", age: 26, caps: 38, goals: 4, club: "Everton" },
      { pos: "FW", name: "Nicolas Jackson", age: 24, caps: 31, goals: 8, club: "Bayern Munich" },
    ]
  },

  // ===== GROUP J =====
  {
    code: "dz", name: "Algeria", nameCn: "阿尔及利亚", group: "J",
    fifaRank: 35, coach: "Vladimir Petković",
    players: []  // 名单待公布
  },
  {
    code: "ar", name: "Argentina", nameCn: "阿根廷", group: "J",
    fifaRank: 1, coach: "Lionel Scaloni",
    players: [
      { pos: "GK", name: "Emiliano Martínez", age: 33, caps: 59, goals: 0, club: "Aston Villa" },
      { pos: "GK", name: "Juan Musso", age: 32, caps: 3, goals: 0, club: "Atlético Madrid" },
      { pos: "DF", name: "Nicolás Otamendi", age: 38, caps: 130, goals: 8, club: "Benfica" },
      { pos: "DF", name: "Cristian Romero", age: 28, caps: 49, goals: 3, club: "Tottenham Hotspur" },
      { pos: "DF", name: "Nicolás Tagliafico", age: 33, caps: 75, goals: 1, club: "Lyon" },
      { pos: "DF", name: "Gonzalo Montiel", age: 29, caps: 38, goals: 2, club: "River Plate" },
      { pos: "DF", name: "Lisandro Martínez", age: 28, caps: 26, goals: 1, club: "Manchester United" },
      { pos: "DF", name: "Nahuel Molina", age: 28, caps: 58, goals: 1, club: "Atlético Madrid" },
      { pos: "MF", name: "Leandro Paredes", age: 31, caps: 77, goals: 5, club: "Boca Juniors" },
      { pos: "MF", name: "Rodrigo De Paul", age: 32, caps: 85, goals: 2, club: "Inter Miami CF" },
      { pos: "MF", name: "Alexis Mac Allister", age: 27, caps: 44, goals: 6, club: "Liverpool" },
      { pos: "MF", name: "Enzo Fernández", age: 25, caps: 40, goals: 6, club: "Chelsea" },
      { pos: "MF", name: "Giovani Lo Celso", age: 30, caps: 65, goals: 4, club: "Real Betis" },
      { pos: "FW", name: "Lionel Messi", age: 38, caps: 198, goals: 116, club: "Inter Miami CF", captain: true },
      { pos: "FW", name: "Lautaro Martínez", age: 28, caps: 75, goals: 36, club: "Inter Milan" },
      { pos: "FW", name: "Julián Alvarez", age: 25, caps: 50, goals: 25, club: "Atlético Madrid" },
      { pos: "FW", name: "Nicolás González", age: 28, caps: 50, goals: 6, club: "Atlético Madrid" },
    ]
  },
  {
    code: "at", name: "Austria", nameCn: "奥地利", group: "J",
    fifaRank: 23, coach: "Ralf Rangnick",
    players: [
      { pos: "GK", name: "Alexander Schlager", age: 30, caps: 25, goals: 0, club: "Red Bull Salzburg" },
      { pos: "GK", name: "Patrick Pentz", age: 29, caps: 18, goals: 0, club: "Brøndby" },
      { pos: "DF", name: "David Alaba", age: 33, caps: 112, goals: 15, club: "Real Madrid", captain: true },
      { pos: "DF", name: "Stefan Posch", age: 29, caps: 51, goals: 5, club: "Mainz 05" },
      { pos: "DF", name: "Kevin Danso", age: 27, caps: 31, goals: 0, club: "Tottenham Hotspur" },
      { pos: "DF", name: "Philipp Lienhart", age: 29, caps: 40, goals: 3, club: "SC Freiburg" },
      { pos: "MF", name: "Marcel Sabitzer", age: 32, caps: 97, goals: 25, club: "Borussia Dortmund" },
      { pos: "MF", name: "Xaver Schlager", age: 28, caps: 50, goals: 4, club: "RB Leipzig" },
      { pos: "MF", name: "Nicolas Seiwald", age: 25, caps: 46, goals: 1, club: "RB Leipzig" },
      { pos: "MF", name: "Florian Grillitsch", age: 30, caps: 58, goals: 1, club: "Braga" },
      { pos: "MF", name: "Christoph Baumgartner", age: 26, caps: 58, goals: 19, club: "RB Leipzig" },
      { pos: "MF", name: "Konrad Laimer", age: 29, caps: 56, goals: 7, club: "Bayern Munich" },
      { pos: "FW", name: "Marko Arnautović", age: 37, caps: 132, goals: 47, club: "Red Star Belgrade" },
      { pos: "FW", name: "Michael Gregoritsch", age: 32, caps: 74, goals: 24, club: "FC Augsburg" },
      { pos: "FW", name: "Saša Kalajdžić", age: 28, caps: 21, goals: 4, club: "LASK" },
    ]
  },
  {
    code: "jo", name: "Jordan", nameCn: "约旦", group: "J",
    fifaRank: 71, coach: "Jamal Sellami",
    players: [
      { pos: "GK", name: "Yazeed Abulaila", age: 33, caps: 74, goals: 0, club: "Al-Hussein" },
      { pos: "DF", name: "Ihsan Haddad", age: 32, caps: 90, goals: 2, club: "Al-Hussein", captain: true },
      { pos: "DF", name: "Yazan Al-Arab", age: 30, caps: 78, goals: 3, club: "FC Seoul" },
      { pos: "DF", name: "Abdallah Nasib", age: 32, caps: 64, goals: 3, club: "Al-Zawraa" },
      { pos: "MF", name: "Rajaei Ayed", age: 32, caps: 72, goals: 0, club: "Al-Hussein" },
      { pos: "MF", name: "Noor Al-Rawabdeh", age: 29, caps: 66, goals: 3, club: "Selangor" },
      { pos: "MF", name: "Ibrahim Sadeh", age: 26, caps: 55, goals: 3, club: "Al-Karma" },
      { pos: "MF", name: "Mohammad Abu Hashish", age: 31, caps: 54, goals: 1, club: "Al-Karma" },
      { pos: "MF", name: "Nizar Al-Rashdan", age: 27, caps: 45, goals: 4, club: "Qatar SC" },
      { pos: "FW", name: "Musa Al-Taamari", age: 29, caps: 90, goals: 24, club: "Rennes" },
      { pos: "FW", name: "Mahmoud Al-Mardi", age: 32, caps: 87, goals: 9, club: "Al-Hussein" },
      { pos: "FW", name: "Ali Olwan", age: 26, caps: 64, goals: 29, club: "Al-Sailiya" },
    ]
  },

  // ===== GROUP K =====
  {
    code: "co", name: "Colombia", nameCn: "哥伦比亚", group: "K",
    fifaRank: 9, coach: "Néstor Lorenzo",
    players: [
      { pos: "GK", name: "David Ospina", age: 37, caps: 129, goals: 0, club: "Atlético Nacional" },
      { pos: "GK", name: "Camilo Vargas", age: 37, caps: 40, goals: 0, club: "Atlas" },
      { pos: "DF", name: "Davinson Sánchez", age: 29, caps: 77, goals: 3, club: "Galatasaray" },
      { pos: "DF", name: "Yerry Mina", age: 31, caps: 52, goals: 8, club: "Cagliari" },
      { pos: "DF", name: "Daniel Muñoz", age: 30, caps: 44, goals: 3, club: "Crystal Palace" },
      { pos: "DF", name: "Johan Mojica", age: 33, caps: 43, goals: 1, club: "Mallorca" },
      { pos: "DF", name: "Jhon Lucumí", age: 27, caps: 35, goals: 1, club: "Bologna" },
      { pos: "MF", name: "James Rodríguez", age: 34, caps: 124, goals: 31, club: "Minnesota United FC", captain: true },
      { pos: "MF", name: "Jefferson Lerma", age: 31, caps: 64, goals: 5, club: "Crystal Palace" },
      { pos: "MF", name: "Juan Fernando Quintero", age: 33, caps: 47, goals: 6, club: "River Plate" },
      { pos: "MF", name: "Jhon Arias", age: 28, caps: 36, goals: 4, club: "Palmeiras" },
      { pos: "MF", name: "Richard Ríos", age: 26, caps: 30, goals: 2, club: "Benfica" },
      { pos: "FW", name: "Luis Díaz", age: 29, caps: 72, goals: 21, club: "Bayern Munich" },
      { pos: "FW", name: "Jhon Córdoba", age: 33, caps: 21, goals: 6, club: "Krasnodar" },
      { pos: "FW", name: "Cucho Hernández", age: 27, caps: 7, goals: 2, club: "Real Betis" },
    ]
  },
  {
    code: "cd", name: "DR Congo", nameCn: "刚果民主共和国", group: "K",
    fifaRank: 52, coach: "Sébastien Desabre",
    players: [
      { pos: "GK", name: "Lionel Mpasi", age: 31, caps: 27, goals: 0, club: "Le Havre" },
      { pos: "DF", name: "Chancel Mbemba", age: 31, caps: 107, goals: 7, club: "Lille", captain: true },
      { pos: "DF", name: "Arthur Masuaku", age: 32, caps: 44, goals: 4, club: "Lens" },
      { pos: "DF", name: "Gédéon Kalulu", age: 28, caps: 27, goals: 0, club: "Aris Limassol" },
      { pos: "DF", name: "Axel Tuanzebe", age: 28, caps: 12, goals: 1, club: "Burnley" },
      { pos: "DF", name: "Aaron Wan-Bissaka", age: 28, caps: 10, goals: 0, club: "West Ham United" },
      { pos: "MF", name: "Samuel Moutoussamy", age: 29, caps: 56, goals: 0, club: "Atromitos" },
      { pos: "MF", name: "Edo Kayembe", age: 28, caps: 41, goals: 2, club: "Watford" },
      { pos: "MF", name: "Gaël Kakuta", age: 34, caps: 30, goals: 5, club: "AEL" },
      { pos: "MF", name: "Noah Sadiki", age: 21, caps: 18, goals: 0, club: "Sunderland" },
      { pos: "FW", name: "Cédric Bakambu", age: 35, caps: 68, goals: 21, club: "Real Betis" },
      { pos: "FW", name: "Yoane Wissa", age: 29, caps: 36, goals: 9, club: "Newcastle United" },
      { pos: "FW", name: "Théo Bongonda", age: 30, caps: 37, goals: 7, club: "Spartak Moscow" },
    ]
  },
  {
    code: "pt", name: "Portugal", nameCn: "葡萄牙", group: "K",
    fifaRank: 6, coach: "Roberto Martínez",
    players: [
      { pos: "GK", name: "Diogo Costa", age: 26, caps: 42, goals: 0, club: "Porto" },
      { pos: "GK", name: "José Sá", age: 33, caps: 4, goals: 0, club: "Wolverhampton Wanderers" },
      { pos: "DF", name: "Rúben Dias", age: 29, caps: 74, goals: 3, club: "Manchester City" },
      { pos: "DF", name: "João Cancelo", age: 32, caps: 66, goals: 12, club: "Barcelona" },
      { pos: "DF", name: "Nélson Semedo", age: 32, caps: 48, goals: 0, club: "Fenerbahçe" },
      { pos: "DF", name: "Nuno Mendes", age: 23, caps: 43, goals: 1, club: "Paris Saint-Germain" },
      { pos: "DF", name: "Diogo Dalot", age: 27, caps: 33, goals: 3, club: "Manchester United" },
      { pos: "DF", name: "Gonçalo Inácio", age: 24, caps: 20, goals: 2, club: "Sporting CP" },
      { pos: "MF", name: "Bernardo Silva", age: 31, caps: 107, goals: 14, club: "Manchester City" },
      { pos: "MF", name: "Bruno Fernandes", age: 31, caps: 87, goals: 28, club: "Manchester United" },
      { pos: "MF", name: "Rúben Neves", age: 29, caps: 65, goals: 1, club: "Al-Hilal" },
      { pos: "MF", name: "Vitinha", age: 26, caps: 37, goals: 0, club: "Paris Saint-Germain" },
      { pos: "MF", name: "João Neves", age: 21, caps: 21, goals: 3, club: "Paris Saint-Germain" },
      { pos: "FW", name: "Cristiano Ronaldo", age: 41, caps: 226, goals: 143, club: "Al-Nassr", captain: true },
      { pos: "FW", name: "João Félix", age: 26, caps: 52, goals: 12, club: "Al-Nassr" },
      { pos: "FW", name: "Rafael Leão", age: 27, caps: 43, goals: 5, club: "Milan" },
      { pos: "FW", name: "Gonçalo Ramos", age: 24, caps: 24, goals: 10, club: "Paris Saint-Germain" },
      { pos: "FW", name: "Pedro Neto", age: 26, caps: 23, goals: 2, club: "Chelsea" },
    ]
  },
  {
    code: "uz", name: "Uzbekistan", nameCn: "乌兹别克斯坦", group: "K",
    fifaRank: 74, coach: "Fabio Cannavaro",
    players: [
      { pos: "GK", name: "Utkir Yusupov", age: 35, caps: 39, goals: 0, club: "Navbahor" },
      { pos: "DF", name: "Rustam Ashurmatov", age: 29, caps: 47, goals: 1, club: "Esteghlal" },
      { pos: "DF", name: "Farrukh Sayfiev", age: 35, caps: 44, goals: 1, club: "Neftchi" },
      { pos: "DF", name: "Khojiakbar Alijonov", age: 29, caps: 40, goals: 2, club: "Pakhtakor" },
      { pos: "DF", name: "Abdukodir Khusanov", age: 22, caps: 25, goals: 0, club: "Manchester City" },
      { pos: "MF", name: "Otabek Shukurov", age: 29, caps: 82, goals: 9, club: "Baniyas" },
      { pos: "MF", name: "Odiljon Hamrobekov", age: 30, caps: 71, goals: 1, club: "Tractor" },
      { pos: "MF", name: "Jamshid Iskanderov", age: 32, caps: 37, goals: 4, club: "Neftchi" },
      { pos: "MF", name: "Akmal Mozgovoy", age: 27, caps: 23, goals: 1, club: "Pakhtakor" },
      { pos: "FW", name: "Eldor Shomurodov", age: 30, caps: 90, goals: 44, club: "İstanbul Başakşehir", captain: true },
      { pos: "FW", name: "Igor Sergeev", age: 33, caps: 81, goals: 24, club: "Persepolis" },
      { pos: "FW", name: "Jaloliddin Masharipov", age: 32, caps: 74, goals: 12, club: "Esteghlal" },
      { pos: "FW", name: "Oston Urunov", age: 25, caps: 40, goals: 10, club: "Persepolis" },
      { pos: "FW", name: "Abbosbek Fayzullaev", age: 22, caps: 30, goals: 8, club: "İstanbul Başakşehir" },
    ]
  },

  // ===== GROUP L =====
  {
    code: "hr", name: "Croatia", nameCn: "克罗地亚", group: "L",
    fifaRank: 13, coach: "Zlatko Dalić",
    players: [
      { pos: "GK", name: "Dominik Livaković", age: 31, caps: 73, goals: 0, club: "Dinamo Zagreb" },
      { pos: "DF", name: "Joško Gvardiol", age: 24, caps: 46, goals: 4, club: "Manchester City" },
      { pos: "DF", name: "Duje Ćaleta-Car", age: 29, caps: 38, goals: 1, club: "Real Sociedad" },
      { pos: "DF", name: "Josip Šutalo", age: 26, caps: 31, goals: 0, club: "Ajax" },
      { pos: "DF", name: "Josip Stanišić", age: 26, caps: 29, goals: 0, club: "Bayern Munich" },
      { pos: "MF", name: "Luka Modrić", age: 40, caps: 196, goals: 28, club: "Milan", captain: true },
      { pos: "MF", name: "Mateo Kovačić", age: 32, caps: 111, goals: 5, club: "Manchester City" },
      { pos: "MF", name: "Mario Pašalić", age: 31, caps: 83, goals: 11, club: "Atalanta" },
      { pos: "MF", name: "Nikola Vlašić", age: 28, caps: 61, goals: 10, club: "Torino" },
      { pos: "MF", name: "Luka Sučić", age: 23, caps: 19, goals: 1, club: "Real Sociedad" },
      { pos: "MF", name: "Martin Baturina", age: 23, caps: 17, goals: 1, club: "Como" },
      { pos: "FW", name: "Ivan Perišić", age: 37, caps: 152, goals: 38, club: "PSV Eindhoven" },
      { pos: "FW", name: "Andrej Kramarić", age: 34, caps: 114, goals: 36, club: "TSG Hoffenheim" },
      { pos: "FW", name: "Ante Budimir", age: 34, caps: 36, goals: 6, club: "Osasuna" },
    ]
  },
  {
    code: "gb-eng", name: "England", nameCn: "英格兰", group: "L",
    fifaRank: 8, coach: "Thomas Tuchel",
    players: [
      { pos: "GK", name: "Jordan Pickford", age: 32, caps: 82, goals: 0, club: "Everton" },
      { pos: "GK", name: "Dean Henderson", age: 29, caps: 2, goals: 0, club: "Crystal Palace" },
      { pos: "DF", name: "John Stones", age: 32, caps: 87, goals: 3, club: "Manchester City" },
      { pos: "DF", name: "Marc Guéhi", age: 25, caps: 27, goals: 1, club: "Manchester City" },
      { pos: "DF", name: "Reece James", age: 26, caps: 22, goals: 1, club: "Chelsea" },
      { pos: "DF", name: "Ezri Konsa", age: 28, caps: 18, goals: 1, club: "Aston Villa" },
      { pos: "DF", name: "Dan Burn", age: 34, caps: 6, goals: 0, club: "Newcastle United" },
      { pos: "MF", name: "Jordan Henderson", age: 35, caps: 89, goals: 3, club: "Brentford" },
      { pos: "MF", name: "Declan Rice", age: 27, caps: 72, goals: 6, club: "Arsenal" },
      { pos: "MF", name: "Jude Bellingham", age: 22, caps: 46, goals: 6, club: "Real Madrid" },
      { pos: "MF", name: "Morgan Rogers", age: 23, caps: 13, goals: 1, club: "Aston Villa" },
      { pos: "MF", name: "Kobbie Mainoo", age: 21, caps: 12, goals: 0, club: "Manchester United" },
      { pos: "FW", name: "Harry Kane", age: 32, caps: 112, goals: 78, club: "Bayern Munich", captain: true },
      { pos: "FW", name: "Marcus Rashford", age: 28, caps: 70, goals: 18, club: "Barcelona" },
      { pos: "FW", name: "Bukayo Saka", age: 24, caps: 48, goals: 14, club: "Arsenal" },
      { pos: "FW", name: "Ollie Watkins", age: 30, caps: 20, goals: 6, club: "Aston Villa" },
      { pos: "FW", name: "Eberechi Eze", age: 27, caps: 16, goals: 3, club: "Arsenal" },
    ]
  },
  {
    code: "gh", name: "Ghana", nameCn: "加纳", group: "L",
    fifaRank: 60, coach: "Carlos Queiroz",
    players: [
      { pos: "GK", name: "Lawrence Ati-Zigi", age: 29, caps: 28, goals: 0, club: "St. Gallen" },
      { pos: "DF", name: "Abdul Rahman Baba", age: 31, caps: 52, goals: 1, club: "PAOK" },
      { pos: "DF", name: "Gideon Mensah", age: 27, caps: 39, goals: 0, club: "Auxerre" },
      { pos: "DF", name: "Alexander Djiku", age: 31, caps: 38, goals: 4, club: "Spartak Moscow" },
      { pos: "DF", name: "Alidu Seidu", age: 26, caps: 23, goals: 1, club: "Rennes" },
      { pos: "MF", name: "Thomas Partey", age: 32, caps: 56, goals: 15, club: "Villarreal" },
      { pos: "MF", name: "Abdul Fatawu", age: 22, caps: 27, goals: 3, club: "Leicester City" },
      { pos: "MF", name: "Kamaldeen Sulemana", age: 24, caps: 27, goals: 1, club: "Atalanta" },
      { pos: "MF", name: "Elisha Owusu", age: 28, caps: 19, goals: 0, club: "Auxerre" },
      { pos: "FW", name: "Jordan Ayew", age: 34, caps: 117, goals: 33, club: "Leicester City", captain: true },
      { pos: "FW", name: "Antoine Semenyo", age: 26, caps: 34, goals: 3, club: "Manchester City" },
      { pos: "FW", name: "Iñaki Williams", age: 31, caps: 25, goals: 2, club: "Athletic Bilbao" },
      { pos: "FW", name: "Ernest Nuamah", age: 22, caps: 18, goals: 4, club: "Lyon" },
    ]
  },
  {
    code: "pa", name: "Panama", nameCn: "巴拿马", group: "L",
    fifaRank: 72, coach: "Thomas Christiansen",
    players: [
      { pos: "GK", name: "Luis Mejía", age: 35, caps: 56, goals: 0, club: "Nacional" },
      { pos: "GK", name: "Orlando Mosquera", age: 31, caps: 46, goals: 0, club: "Al-Fayha" },
      { pos: "DF", name: "Eric Davis", age: 35, caps: 104, goals: 9, club: "Plaza Amador" },
      { pos: "DF", name: "Fidel Escobar", age: 31, caps: 96, goals: 4, club: "Saprissa" },
      { pos: "DF", name: "Michael Amir Murillo", age: 30, caps: 91, goals: 9, club: "Beşiktaş" },
      { pos: "DF", name: "Roderick Miller", age: 34, caps: 48, goals: 2, club: "Turan Tovuz" },
      { pos: "DF", name: "Andrés Andrade", age: 27, caps: 47, goals: 1, club: "LASK" },
      { pos: "MF", name: "Aníbal Godoy", age: 36, caps: 159, goals: 4, club: "San Diego FC", captain: true },
      { pos: "MF", name: "Alberto Quintero", age: 38, caps: 140, goals: 7, club: "Plaza Amador" },
      { pos: "MF", name: "Yoel Bárcenas", age: 32, caps: 101, goals: 10, club: "Mazatlán" },
      { pos: "MF", name: "Adalberto Carrasquilla", age: 27, caps: 73, goals: 3, club: "UNAM" },
      { pos: "FW", name: "José Fajardo", age: 32, caps: 65, goals: 17, club: "Universidad Católica" },
      { pos: "FW", name: "Ismael Díaz", age: 29, caps: 54, goals: 17, club: "León" },
      { pos: "FW", name: "Cecilio Waterman", age: 35, caps: 52, goals: 14, club: "Universidad de Concepción" },
    ]
  },
];

// 按小组分类
export const teamsByGroup = wcTeams.reduce((acc, team) => {
  if (!acc[team.group]) acc[team.group] = [];
  acc[team.group].push(team);
  return acc;
}, {} as Record<string, TeamData[]>);

// 按国

// 按国家代码查找球队
export function getTeamByCode(code: string): TeamData | undefined {
  return wcTeams.find(t => t.code === code);
}

// 位置中文映射
export const posMap: Record<string, string> = {
  GK: "门将",
  DF: "后卫",
  MF: "中场",
  FW: "前锋",
};
