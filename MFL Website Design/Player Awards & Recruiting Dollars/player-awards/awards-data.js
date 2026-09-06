/* CFFB — Player Awards sample data (MFL home-page module).
   All figures are illustrative sample data. Player names are public figures;
   fantasy points / percentages are fabricated for the template. */
(function () {
  // team abbr -> { name, color, txt (chip text color), conf }
  const T = {
    // SEC
    UGA:['Georgia','#BA0C2F','#fff','sec'], TEX:['Texas','#BF5700','#fff','sec'],
    ALA:['Alabama','#9E1B32','#fff','sec'], LSU:['LSU','#461D7C','#FDD023','sec'],
    TENN:['Tennessee','#FF8200','#0A0A0A','sec'], MISS:['Ole Miss','#14213D','#CE1126','sec'],
    TAMU:['Texas A&M','#500000','#fff','sec'], MIZ:['Missouri','#F1B82D','#0A0A0A','sec'],
    OU:['Oklahoma','#841617','#fff','sec'], SC:['South Carolina','#73000A','#fff','sec'],
    FLA:['Florida','#0021A5','#fff','sec'], AUB:['Auburn','#0C2340','#E87722','sec'],
    // Big Ten
    OSU:['Ohio State','#BB0000','#fff','b1g'], ORE:['Oregon','#154733','#FEE123','b1g'],
    MICH:['Michigan','#00274C','#FFCB05','b1g'], PSU:['Penn State','#041E42','#fff','b1g'],
    IU:['Indiana','#990000','#EEEDEB','b1g'], ILL:['Illinois','#13294B','#E84A27','b1g'],
    NEB:['Nebraska','#E41C38','#fff','b1g'], USC:['USC','#990000','#FFC72C','b1g'],
    UW:['Washington','#4B2E83','#B7A57A','b1g'], IOWA:['Iowa','#FFCD00','#0A0A0A','b1g'],
    // ACC
    MIA:['Miami','#F47321','#005030','acc'], CLEM:['Clemson','#F56600','#522D80','acc'],
    FSU:['Florida State','#782F40','#CEB888','acc'], LOU:['Louisville','#AD0000','#fff','acc'],
    SMU:['SMU','#354CA1','#C8102E','acc'], GT:['Georgia Tech','#B3A369','#0A0A0A','acc'],
    NCST:['NC State','#CC0000','#fff','acc'], VT:['Virginia Tech','#630031','#CF4420','acc'],
    DUKE:['Duke','#003087','#fff','acc'], UNC:['North Carolina','#4B9CD3','#0A0A0A','acc'],
    // Big 12
    ASU:['Arizona State','#8C1D40','#FFC627','big12'], BYU:['BYU','#002E5D','#fff','big12'],
    ISU:['Iowa State','#C8102E','#F1BE48','big12'], KSU:['Kansas State','#512888','#fff','big12'],
    TTU:['Texas Tech','#CC0000','#fff','big12'], COLO:['Colorado','#000000','#CFB87C','big12'],
    BAY:['Baylor','#003015','#FFB81C','big12'], UTAH:['Utah','#CC0000','#fff','big12'],
    TCU:['TCU','#4D1979','#fff','big12'], CIN:['Cincinnati','#E00122','#fff','big12'],
    WVU:['West Virginia','#002855','#EAAA00','big12'], KU:['Kansas','#0051BA','#E8000D','big12'],
    // AAC
    ARMY:['Army','#0A0A0A','#D4BF91','aac'], NAVY:['Navy','#00205B','#C5B783','aac'],
    TUL:['Tulane','#006747','#418FDE','aac'], MEM:['Memphis','#003087','#898D8D','aac'],
    UTSA:['UTSA','#0C2340','#F15A22','aac'], USF:['USF','#006747','#CFC493','aac'],
    ECU:['East Carolina','#592A8A','#FDC82F','aac'], UNT:['North Texas','#00853E','#fff','aac'],
    TEM:['Temple','#9D2235','#fff','aac'], CHAR:['Charlotte','#046A38','#fff','aac'],
    // Pac-12
    BSU:['Boise State','#0033A0','#D64309','pac'], WSU:['Washington State','#981E32','#5E6A71','pac'],
    ORST:['Oregon State','#DC4405','#0A0A0A','pac'], CSU:['Colorado State','#1E4D2B','#C8C372','pac'],
    SDSU:['San Diego State','#A6192E','#000','pac'], FRES:['Fresno State','#DB0032','#003594','pac'],
    USU:['Utah State','#00263A','#8A8D8F','pac'], TXST:['Texas State','#501214','#8B6f1F','pac'],
    GONZ:['Gonzaga','#002967','#C8102E','pac'], NEV:['Nevada','#003366','#807F84','pac'],
  };
  const team = (a) => { const t = T[a] || [a,'#2A2A2A','#fff','ind']; return { abbr:a, name:t[0], color:t[1], txt:t[2], conf:t[3] }; };

  const conferences = {
    sec:   { key:'sec',   label:'SEC',     accent:'#C9A227', tint:'rgba(201,162,39,0.14)' },
    b1g:   { key:'b1g',   label:'Big Ten', accent:'#7DA0CC', tint:'rgba(74,111,165,0.16)' },
    acc:   { key:'acc',   label:'ACC',     accent:'#C58DA0', tint:'rgba(139,74,92,0.18)' },
    big12: { key:'big12', label:'Big 12',  accent:'#D88787', tint:'rgba(184,69,69,0.16)' },
    aac:   { key:'aac',   label:'AAC',     accent:'#A799C0', tint:'rgba(107,92,139,0.18)' },
    pac:   { key:'pac',   label:'Pac-12',  accent:'#9CB8A8', tint:'rgba(92,122,106,0.18)' },
  };

  // "name|TEAM|POS|CLASS|posRank|pts|pctTeam|confPts"
  const P = (s) => { const [name,tm,pos,cls,pr,pts,pct,cp]=s.split('|'); const t=team(tm);
    return { name, pos, cls, posRank:+pr, pts:+pts, pctTeam:+pct, confPts:+cp, team:t }; };
  const list = (arr) => arr.map((s,i)=>({ rank:i+1, ...P(s) }));

  // "name|TEAM|overall|conf|teamPtsFor|swing"
  const C = (s,i) => { const [name,tm,ov,cf,tp,sw]=s.split('|'); const t=team(tm);
    return { rank:i+1, name, team:t, overall:ov, confRec:cf, teamPts:+tp, swing:+sw }; };

  const national = {
    heisman: {
      key:'heisman', name:'Heisman Trophy', honors:'Most Outstanding Player', pos:'ANY',
      finalists: list([
        'Arch Manning|TEX|QB|JR|1|341|29|181',
        'Jeremiah Smith|OSU|WR|SO|1|318|31|166',
        'Jeremiyah Love|ND|RB|JR|1|306|33|158',
        'Julian Sayin|OSU|QB|SO|3|298|27|154',
        'Ryan Williams|ALA|WR|SO|2|287|28|149',
        'LaNorris Sellers|SC|QB|JR|4|281|30|142',
        'Dylan Raiola|NEB|QB|SO|5|274|32|138',
        'Garrett Nussmeier|LSU|QB|SR|6|269|26|131',
        'Nico Iamaleava|UCLA|QB|JR|7|261|29|127',
        'Drew Allar|PSU|QB|SR|8|256|25|124',
      ]),
    },
    obrien: {
      key:'obrien', name:'Davey O\u2019Brien', honors:'Best Quarterback', pos:'QB',
      finalists: list([
        'Arch Manning|TEX|QB|JR|1|341|29|181',
        'Julian Sayin|OSU|QB|SO|2|298|27|154',
        'LaNorris Sellers|SC|QB|JR|3|281|30|142',
        'Dylan Raiola|NEB|QB|SO|4|274|32|138',
        'Garrett Nussmeier|LSU|QB|SR|5|269|26|131',
        'Nico Iamaleava|UCLA|QB|JR|6|261|29|127',
        'Drew Allar|PSU|QB|SR|7|256|25|124',
        'DJ Lagway|FLA|QB|SO|8|248|31|119',
        'Cade Klubnik|CLEM|QB|SR|9|243|24|116',
        'Sam Leavitt|ASU|QB|JR|10|238|28|112',
      ]),
    },
    walker: {
      key:'walker', name:'Doak Walker', honors:'Best Running Back', pos:'RB',
      finalists: list([
        'Jeremiyah Love|ND|RB|JR|1|306|33|158',
        'Nicholas Singleton|PSU|RB|SR|2|271|26|132',
        'Jonah Coleman|UW|RB|SR|3|258|31|121',
        'CJ Baxter|TEX|RB|JR|4|246|22|118',
        'Kaytron Allen|PSU|RB|SR|5|239|23|114',
        'Bryson Washington|BAY|RB|SO|6|231|34|109',
        'Makhi Hughes|ORE|RB|JR|7|227|24|106',
        'Le\u2019Veon Moss|TAMU|RB|JR|8|221|29|101',
        'Kanye Udoh|TAMU|RB|SO|9|214|26|97',
        'Justice Haynes|MICH|RB|JR|10|208|28|94',
      ]),
    },
    biletnikoff: {
      key:'biletnikoff', name:'Biletnikoff', honors:'Best Wide Receiver', pos:'WR',
      finalists: list([
        'Jeremiah Smith|OSU|WR|SO|1|318|31|166',
        'Ryan Williams|ALA|WR|SO|2|287|28|149',
        'Carnell Tate|OSU|WR|JR|3|259|24|129',
        'Antonio Williams|CLEM|WR|SR|4|244|30|121',
        'Eric Singleton|AUB|WR|JR|5|236|33|114',
        'Denzel Boston|UW|WR|SR|6|229|31|108',
        'Nyck Harbor|SC|WR|JR|7|223|27|104',
        'Barion Brown|LSU|WR|SR|8|217|25|99',
        'Germie Bernard|ALA|WR|SR|9|211|22|96',
        'Cam Coleman|AUB|WR|SO|10|206|28|92',
      ]),
    },
    coach: {
      key:'coach', name:'Coach of the Year', honors:'Top Head Coach', pos:'HC',
      isCoach:true,
      finalists: [
        'Steve Sarkisian|TEX|11-1|7-1|468|-14',
        'Ryan Day|OSU|11-1|8-0|502|-9',
        'Kalen DeBoer|ALA|10-2|6-2|441|+3',
        'Curt Cignetti|IU|11-1|8-0|455|-21',
        'Dan Lanning|ORE|11-1|8-0|489|-6',
        'Shane Beamer|SC|9-3|5-3|398|+12',
        'James Franklin|PSU|10-2|7-1|421|-4',
        'Kenny Dillingham|ASU|10-2|7-1|407|+8',
        'Marcus Freeman|ND|11-1|0-0|477|-11',
        'Jon Sumrall|TUL|10-2|7-1|389|+15',
      ].map(C),
    },
  };

  // conference all-league teams. "POS|name|TEAM|CLASS|posRank|pts|pctTeam|confPts"
  // Full starting lineup per team: 1 QB, 3 RB, 4 WR/TE (3 WR + 1 TE).
  const confTiers = {
    sec: {
      first: list0(['QB|Arch Manning|TEX|JR|1|341|29|181','RB|Le\u2019Veon Moss|TAMU|JR|8|221|29|101','RB|CJ Baxter|TEX|JR|4|246|22|118','RB|Nate Frazier|UGA|SO|11|196|21|93','WR|Ryan Williams|ALA|SO|2|287|28|149','WR|Eric Singleton|AUB|JR|5|236|33|114','WR|Nyck Harbor|SC|JR|7|223|27|104','TE|Oscar Delp|UGA|SR|3|154|16|78']),
      second: list0(['QB|Garrett Nussmeier|LSU|SR|5|269|26|131','RB|Kanye Udoh|TAMU|SO|9|214|26|97','RB|Jam Miller|ALA|SR|14|181|19|84','RB|Ahmad Hardy|MIZ|SO|16|173|31|80','WR|Barion Brown|LSU|SR|8|217|25|99','WR|Germie Bernard|ALA|SR|9|211|22|96','WR|Cam Coleman|AUB|SO|10|206|28|92','TE|Caleb Odom|ALA|SO|6|131|14|66']),
      third: list0(['QB|LaNorris Sellers|SC|JR|4|281|30|142','RB|Trevor Etienne|UGA|SR|18|168|20|78','RB|Kewan Lacy|MISS|SO|20|161|27|74','RB|Marcus Carroll|MIZ|SR|22|154|23|70','WR|Cayden Lee|MISS|JR|12|194|24|90','WR|Mike Matthews|TENN|SO|13|187|22|85','WR|Zavion Thomas|LSU|SR|15|179|21|82','TE|Luke Lachey|TENN|SR|9|118|12|58']),
    },
    b1g: {
      first: list0(['QB|Julian Sayin|OSU|SO|2|298|27|154','RB|Nicholas Singleton|PSU|SR|2|271|26|132','RB|Kaytron Allen|PSU|SR|5|239|23|114','RB|Justice Haynes|MICH|JR|10|208|28|94','WR|Jeremiah Smith|OSU|SO|1|318|31|166','WR|Carnell Tate|OSU|JR|3|259|24|129','WR|Denzel Boston|UW|SR|6|229|31|108','TE|Max Klare|OSU|SR|1|171|15|86']),
      second: list0(['QB|Dylan Raiola|NEB|SO|4|274|32|138','RB|Makhi Hughes|ORE|JR|7|227|24|106','RB|Kalel Mullings|MICH|SR|13|186|22|86','RB|Emmett Johnson|NEB|JR|15|177|24|82','WR|Ryan Wingo|USC|SO|9|213|27|99','WR|Dane Key|NEB|SR|11|198|26|92','WR|Makai Lemon|USC|JR|12|194|25|90','TE|Luke Reynolds|PSU|SO|4|139|13|69']),
      third: list0(['QB|Drew Allar|PSU|SR|7|256|25|124','RB|Jordan Marshall|MICH|SO|17|170|21|79','RB|Anthony Frias|MINN|JR|19|163|24|75','RB|Kwinten Ives|OSU|SO|21|156|22|72','WR|Elijah Sarratt|IU|SR|10|207|26|97','WR|Kaden Wetjen|IOWA|JR|14|182|23|84','WR|Trebor Pena|PSU|SR|16|175|22|81','TE|Jack Nickel|WISC|JR|8|121|11|60']),
    },
    acc: {
      first: list0(['QB|Cade Klubnik|CLEM|SR|9|243|24|116','RB|Mark Fletcher Jr.|MIA|JR|12|202|27|95','RB|Omarion Hampton|UNC|JR|18|172|30|81','RB|Isaac Brown|LOU|SO|20|165|30|76','WR|Antonio Williams|CLEM|SR|4|244|30|121','WR|Malik Benson|FSU|SR|13|196|28|90','WR|Chris Bell|LOU|JR|15|187|31|85','TE|Jack Bech|LOU|SR|5|148|17|72']),
      second: list0(['QB|Kevin Jennings|SMU|JR|11|228|29|108','RB|Jamal Haynes|GT|SR|17|179|29|84','RB|Brashard Smith|SMU|SR|19|168|26|78','RB|Duke Watson|MIA|SO|23|154|27|70','WR|Bryson Rodgers|CLEM|SO|14|191|24|88','WR|Squirrel White|FSU|SR|17|179|22|80','WR|Jordan Dwyer|SMU|JR|16|183|25|82','TE|Elijah Arroyo|MIA|SR|7|127|12|61']),
      third: list0(['QB|Haynes King|GT|SR|13|217|26|101','RB|Kaleb Jackson|LOU|JR|24|151|24|69','RB|Star Thomas|DUKE|SR|26|144|25|65','RB|Caullin Lacy|LOU|SR|21|161|23|74','WR|Eric Rivers|GT|JR|16|183|27|84','WR|Ja\u2019Corey Brooks|LOU|JR|15|186|29|86','WR|Nate McCollum|UNC|SR|18|173|24|79','TE|Justin Joly|NCST|JR|9|118|12|57']),
    },
    big12: {
      first: list0(['QB|Sam Leavitt|ASU|JR|10|238|28|112','RB|Bryson Washington|BAY|SO|6|231|34|109','RB|Cam Skattebo|ASU|SR|9|219|31|103','RB|Jaydn Ott|OU|JR|24|151|22|68','WR|Jordyn Tyson|ASU|JR|11|226|33|107','WR|Josh Kelly|TTU|SR|18|177|27|82','WR|Coleman Owen|TTU|SO|22|159|26|72','TE|Terrance Ferguson|UTAH|SR|6|132|15|64']),
      second: list0(['QB|Avery Johnson|KSU|SO|12|221|30|103','RB|Dylan Edwards|KSU|JR|20|165|28|76','RB|CJ Donaldson|WVU|SR|22|158|26|72','RB|Roydell Williams|UTAH|SR|26|144|23|64','WR|Caleb Douglas|TTU|JR|21|162|27|75','WR|Josh Cameron|BAY|JR|24|148|25|66','WR|Terrell Timmons|WVU|SO|23|155|24|71','TE|Bryson Canty|CIN|JR|11|108|12|51']),
      third: list0(['QB|Kaidon Salter|COLO|SR|14|209|27|97','RB|Devin Neal|KU|SR|21|162|24|74','RB|Ismail Mahdi|TTU|JR|24|154|29|72','RB|LJ Martin|BYU|JR|27|139|30|63','WR|Chase Roberts|BYU|SR|22|159|26|72','WR|Micah Hudson|TTU|SO|24|148|25|66','WR|Cam Camper|ISU|SR|26|143|24|65','TE|Ben Roberts|KSU|JR|13|97|10|46']),
    },
    aac: {
      first: list0(['QB|Byrum Brown|USF|JR|15|206|31|98','RB|Kanye Udoh|ARMY|SO|11|198|35|94','RB|Makhi Hughes|TUL|JR|13|191|33|90','RB|Mario Anderson|MEM|SR|18|179|30|84','WR|Chris Brazzell|TUL|JR|20|168|29|79','WR|Que\u2019shaun Byrd|MEM|SR|23|156|27|72','WR|Sean Atkins|USF|SR|25|147|28|68','TE|Holden Staes|MEM|JR|9|116|13|56']),
      second: list0(['QB|Brendon Lewis|MEM|SR|17|191|29|90','RB|Kentrel Bullock|USF|JR|22|161|31|75','RB|Shane Porter|CHAR|SO|24|154|29|71','RB|Peny Boone|TUL|SR|29|132|27|60','WR|De\u2019Corian Clark|UTSA|SR|24|151|26|70','WR|Demeer Blankumsee|MEM|SR|25|145|27|67','WR|Elijah Spencer|CHAR|JR|26|143|25|66','TE|Josh Ekwenike|TUL|SO|11|101|11|48']),
      third: list0(['QB|Jalen Kitna|UTSA|SR|19|182|28|85','RB|Robert Henry Jr.|TUL|SR|24|154|29|72','RB|Kevorian Barnes|UTSA|JR|27|139|28|63','RB|Dashon Bussell|CHAR|SO|30|129|30|58','WR|Da\u2019Marcus Crosby|ECU|JR|26|143|27|66','WR|Jared Wayne|TEM|SR|28|134|25|60','WR|Anthony Smith|MEM|JR|27|138|26|63','TE|Cam Barmore|NAVY|JR|13|94|9|44']),
    },
    pac: {
      first: list0(['QB|Maddux Madsen|BSU|JR|16|201|30|94','RB|Ashton Jeanty|BSU|SR|3|258|36|121','RB|Damien Martinez|ORST|JR|13|188|32|88','RB|Jacory Croskey-Merritt|USU|SR|24|152|30|70','WR|Mac Dalena|FRES|JR|21|163|28|76','WR|Tory Horton|CSU|SR|22|159|30|74','WR|Kris Hutson|WSU|SR|23|154|27|71','TE|Matt Lauter|BSU|SR|10|112|13|54']),
      second: list0(['QB|John Mateer|WSU|JR|17|194|29|90','RB|Cam Davis|SDSU|SR|20|166|31|77','RB|Jaylon Glover|ORST|JR|26|141|28|64','RB|Rahsul Faison|USU|SR|29|132|27|60','WR|Chase Sowell|FRES|JR|25|146|26|67','WR|Louis Brown IV|CSU|JR|24|148|27|68','WR|Carlos Hernandez|SDSU|SO|27|137|25|62','TE|Cameron Barmore|NEV|SO|12|98|11|46']),
      third: list0(['QB|Trey Kukuk|BSU|SO|20|171|27|79','RB|Rocko Griffin|BSU|SO|28|136|28|62','RB|Elelyon Noa|BSU|JR|30|129|27|58','RB|Anthony Grant|CSU|SR|32|122|26|55','WR|Jaden Casey|FRES|SO|29|128|24|57','WR|Josh Cortez|CSU|SO|30|124|25|56','WR|Gatlin Bair|BSU|SO|31|120|23|54','TE|Trey Cornist|CSU|JR|14|89|9|42']),
    },
  };
  // conference tuples lead with POS: "POS|name|TEAM|CLASS|posRank|pts|pctTeam|confPts"
  function PC(s){ const [pos,name,tm,cls,pr,pts,pct,cp]=s.split('|'); const t=team(tm);
    return { pos, name, cls, posRank:+pr, pts:+pts, pctTeam:+pct, confPts:+cp, team:t }; }
  function list0(arr){ return arr.map(PC); }

  window.CFFB_AWARDS = {
    season: '2025',
    week: 12,
    conferences,
    national,
    nationalOrder: ['heisman','obrien','walker','biletnikoff','coach'],
    confOrder: ['sec','b1g','acc','big12','aac','pac'],
    confTiers,
  };
})();
