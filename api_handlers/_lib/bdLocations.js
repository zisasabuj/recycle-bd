// Bangladesh administrative divisions: District → Thana (Police Station / Upazila)
// Source: Local Government Engineering Department (LGED) reference list
// 64 districts, ~495 thanas. Used for buyer/seller location search.

// Major cities with their urban areas (used for product listing form).
// Each city has its well-known neighborhoods/areas. This is the primary
// location selector for new listings (cart + bid items).
// NOTE: This is separate from BD_LOCATIONS (which is admin districts with
// their upazilas/thanas). For product listing, users think in terms of cities
// and neighborhoods, not administrative districts.
export const BD_CITIES = {
  'Dhaka':       ['Dhanmondi', 'Mohammadpur', 'Mirpur', 'Uttara', 'Gulshan', 'Banani', 'Bashundhara', 'Old Dhaka', 'Tejgaon', 'Ramna', 'Malibagh', 'Badda', 'Rampura', 'Khilgaon', 'Motijheel', 'Paltan', 'Wari', 'Lalbagh', 'Azimpur', 'New Market', 'Hazaribagh', 'Kamrangirchar', 'Keraniganj', 'Savar', 'Tongi'],
  'Chittagong':  ['Agrabad', 'Panchlaish', 'Khulshi', 'Halishahar', 'Nasirabad', 'Chawk Bazaar', 'Patiya', 'Karnaphuli', 'Bayazid', 'Hathazari'],
  'Sylhet':      ['Zindabazar', 'Ambarkhana', 'Akhalia', 'Shahporan', 'Beanibazar', 'Moulvibazar'],
  'Rajshahi':    ['Shaheb Bazar', 'Boalia', 'Motihar', 'Rajpara', 'Shiroil'],
  'Khulna':      ['Sonadanga', 'Khalishpur', 'Daulatpur', 'Khan Jahan Ali', 'Nirala'],
  'Barishal':    ['Sadar Road', 'Nathullabad', 'Rupatali', 'Banglabazar'],
  'Rangpur':     ['Jahaj Company', 'Pairaband', 'Mahiganj', 'Keranipara'],
  'Mymensingh':  ['Sadar', 'Charpara', 'Kachijhuli', 'Chorganga'],
  'Comilla':     ['Kandirpar', 'Ranir Bazar', 'Tomsom Bridge', 'Bhooter Goli'],
  'Gazipur':     ['Tongi', 'Board Bazar', 'Joydebpur', 'Kaliakair', 'Sreepur', 'Kapasia'],
  'Narayanganj': ['Sadar', 'Bandar', 'Araihazar', 'Rupganj', 'Sonargaon'],
  'Cox\'s Bazar':['Sadar', 'Kolatoli', 'Sugandha', 'Laboni Beach', 'Inani'],
};
export const BD_CITY_NAMES = Object.keys(BD_CITIES).sort();

export const getAreas = (city) => BD_CITIES[city] || [];

export const BD_LOCATIONS = {
  // ============ DHAKA DIVISION ============
  'Dhaka':          ['Dhamrai', 'Dohar', 'Keraniganj', 'Nawabganj', 'Savar'],
  'Faridpur':       ['Alfadanga', 'Bhanga', 'Boalmari', 'Char Bhadrasan', 'Madhukhali', 'Nagarkanda', 'Sadarpur', 'Saltha'],
  'Gazipur':        ['Gazipur Sadar', 'Kaliakair', 'Kaliganj', 'Kapasia', 'Sreepur'],
  'Gopalganj':      ['Gopalganj Sadar', 'Kashiani', 'Kotalipara', 'Muksudpur', 'Tungipara'],
  'Kishoreganj':    ['Austagram', 'Bajitpur', 'Bhairab', 'Hossainpur', 'Itna', 'Karimganj', 'Katiadi', 'Kishoreganj Sadar', 'Kuliarchar', 'Mithamain', 'Nikli', 'Pakundia', 'Tarail'],
  'Madaripur':      ['Dasar', 'Kalkini', 'Madaripur Sadar', 'Rajoir', 'Shibchar'],
  'Manikganj':      ['Daulatpur', 'Ghior', 'Harirampur', 'Manikganj Sadar', 'Saturia', 'Shivalaya', 'Singair'],
  'Munshiganj':     ['Gazaria', 'Lohajang', 'Munshiganj Sadar', 'Sirajdikhan', 'Sreenagar', 'Tongibari'],
  'Narayanganj':    ['Araihazar', 'Bandar', 'Narayanganj Sadar', 'Rupganj', 'Sonargaon'],
  'Narsingdi':      ['Belabo', 'Manohardi', 'Narsingdi Sadar', 'Palash', 'Roypura', 'Shibpur'],
  'Rajbari':        ['Baliakandi', 'Goalandaghat', 'Pangsha', 'Rajbari Sadar', 'Kalukhali'],
  'Shariatpur':     ['Bhedarganj', 'Damudya', 'Gosairhat', 'Naria', 'Shariatpur Sadar', 'Zanjira'],
  'Tangail':        ['Basail', 'Bhuapur', 'Delduar', 'Dhanbari', 'Ghatail', 'Gopalpur', 'Kalihati', 'Madhupur', 'Mirzapur', 'Nagarpur', 'Sakhipur', 'Tangail Sadar'],

  // ============ CHATTOGRAM DIVISION ============
  'Bandarban':      ['Alikadam', 'Bandarban Sadar', 'Lama', 'Naikhongchhari', 'Rowangchhari', 'Ruma', 'Thanchi'],
  'Brahmanbaria':   ['Akhaura', 'Ashuganj', 'Bancharampur', 'Bijoynagar', 'Brahmanbaria Sadar', 'Kasba', 'Nabinagar', 'Nasirnagar', 'Sarail'],
  'Chandpur':       ['Chandpur Sadar', 'Faridganj', 'Haimchar', 'Haziganj', 'Kachua', 'Matlab Dakshin', 'Matlab Uttar', 'Shahrasti'],
  'Chattogram':     ['Anwara', 'Banshkhali', 'Boalkhali', 'Chandanaish', 'Fatikchhari', 'Hathazari', 'Karnaphuli', 'Lohagara', 'Mirsharai', 'Patiya', 'Rangunia', 'Raozan', 'Sandwip', 'Satkania', 'Sitakunda'],
  'Cumilla':        ['Barura', 'Brahmanpara', 'Burichang', 'Chandina', 'Chauddagram', 'Cumilla Adarsha Sadar', 'Cumilla Sadar Dakshin', 'Daudkandi', 'Debidwar', 'Homna', 'Laksam', 'Lalmai', 'Meghna', 'Monohorgonj', 'Muradnagar', 'Nangalkot', 'Titas'],
  "Cox's Bazar":    ['Chakaria', "Cox's Bazar Sadar", 'Kutubdia', 'Maheshkhali', 'Pekua', 'Ramu', 'Teknaf', 'Ukhia'],
  'Feni':           ['Chhagalnaiya', 'Daganbhuiyan', 'Feni Sadar', 'Fulgazi', 'Parshuram', 'Sonagazi'],
  'Khagrachari':    ['Dighinala', 'Guimara', 'Khagrachari Sadar', 'Lakshmichhari', 'Mahalchhari', 'Manikchhari', 'Matiranga', 'Panchhari', 'Ramgarh'],
  'Lakshmipur':     ['Kamalnagar', 'Lakshmipur Sadar', 'Raipur', 'Ramganj', 'Ramgati'],
  'Noakhali':       ['Begumganj', 'Chatkhil', 'Companiganj', 'Hatia', 'Kabirhat', 'Noakhali Sadar', 'Senbagh', 'Sonaimuri', 'Subarnachar'],
  'Rangamati':      ['Baghaichhari', 'Barkal', 'Belaichhari', 'Juraichhari', 'Kaptai', 'Kawkhali', 'Langadu', 'Naniarchar', 'Rajasthali', 'Rangamati Sadar'],

  // ============ RAJSHAHI DIVISION ============
  'Bogura':         ['Adamdighi', 'Bogura Sadar', 'Dhunat', 'Dhupchanchia', 'Gabtali', 'Kahaloo', 'Nandigram', 'Sariakandi', 'Sahajanpur', 'Sherpur', 'Shibganj', 'Sonatala'],
  'Chapainawabganj':['Bholahat', 'Chapainawabganj Sadar', 'Gomastapur', 'Nachole', 'Shibganj'],
  'Joypurhat':      ['Akkelpur', 'Joypurhat Sadar', 'Kalai', 'Khetlal', 'Panchbibi'],
  'Naogaon':        ['Atrai', 'Badalgachi', 'Dhamoirhat', 'Manda', 'Mohadevpur', 'Naogaon Sadar', 'Niamatpur', 'Patnitala', 'Porsha', 'Raninagar', 'Sapahar'],
  'Natore':         ['Bagatipara', 'Baraigram', 'Gurudaspur', 'Lalpur', 'Naldanga', 'Natore Sadar', 'Singra'],
  'Pabna':          ['Atgharia', 'Bera', 'Bhangura', 'Chatmohar', 'Faridpur', 'Ishwardi', 'Pabna Sadar', 'Santhia', 'Sujanagar'],
  'Rajshahi':       ['Bagha', 'Bagmara', 'Charghat', 'Durgapur', 'Godagari', 'Mohanpur', 'Paba', 'Puthia', 'Tanore'],
  'Sirajganj':      ['Belkuchi', 'Chauhali', 'Kamarkhanda', 'Kazipur', 'Raiganj', 'Shahjadpur', 'Sirajganj Sadar', 'Tarash', 'Ullapara'],

  // ============ KHULNA DIVISION ============
  'Bagerhat':       ['Bagerhat Sadar', 'Chitalmari', 'Fakirahat', 'Kachua', 'Mollahat', 'Mongla', 'Morrelganj', 'Rampal', 'Sarankhola'],
  'Chuadanga':      ['Alamdanga', 'Chuadanga Sadar', 'Damurhuda', 'Jibannagar'],
  'Jashore':        ['Abhaynagar', 'Bagherpara', 'Chaugachha', 'Jashore Sadar', 'Jhikargachha', 'Keshabpur', 'Manirampur', 'Sharsha'],
  'Jhenaidah':      ['Harinakunda', 'Jhenaidah Sadar', 'Kaliganj', 'Kotchandpur', 'Maheshpur', 'Shailkupa'],
  'Khulna':         ['Batiaghata', 'Dacope', 'Dumuria', 'Dighalia', 'Koyra', 'Paikgachha', 'Phultala', 'Rupsa', 'Terokhada'],
  'Kushtia':        ['Bheramara', 'Daulatpur', 'Khoksa', 'Kumarkhali', 'Kushtia Sadar', 'Mirpur'],
  'Magura':         ['Magura Sadar', 'Mohammadpur', 'Shalikha', 'Sreepur'],
  'Meherpur':       ['Gangni', 'Meherpur Sadar', 'Mujibnagar'],
  'Narail':         ['Kalia', 'Lohagara', 'Narail Sadar'],
  'Satkhira':       ['Assasuni', 'Debhata', 'Kalaroa', 'Kaliganj', 'Satkhira Sadar', 'Shyamnagar', 'Tala'],

  // ============ BARISHAL DIVISION ============
  'Barguna':        ['Amtali', 'Bamna', 'Barguna Sadar', 'Betagi', 'Patharghata', 'Taltali'],
  'Barishal':       ['Agailjhara', 'Babuganj', 'Bakerganj', 'Banaripara', 'Barishal Sadar', 'Gournadi', 'Hizla', 'Mehendiganj', 'Muladi', 'Nazirpur', 'Uzirpur'],
  'Bhola':          ['Bhola Sadar', 'Burhanuddin', 'Char Fasson', 'Daulatkhan', 'Lalmohan', 'Manpura', 'Tazumuddin'],
  'Jhalokati':      ['Jhalokati Sadar', 'Kathalia', 'Nalchity', 'Rajapur'],
  'Patuakhali':     ['Bauphal', 'Dashmina', 'Dumki', 'Galachipa', 'Kalapara', 'Mirzaganj', 'Patuakhali Sadar', 'Rangabali'],
  'Pirojpur':       ['Bhandaria', 'Kawkhali', 'Mathbaria', 'Nazirpur', 'Pirojpur Sadar', 'Nesarabad', 'Zianagar'],

  // ============ SYLHET DIVISION ============
  'Habiganj':       ['Ajmiriganj', 'Bahubal', 'Baniachong', 'Chunarughat', 'Habiganj Sadar', 'Lakhai', 'Madhabpur', 'Nabiganj', 'Shaistaganj'],
  'Moulvibazar':    ['Barlekha', 'Juri', 'Kamalganj', 'Kulaura', 'Moulvibazar Sadar', 'Rajnagar', 'Sreemangal'],
  'Sunamganj':      ['Bishwamvarpur', 'Chhatak', 'Dakshin Sunamganj', 'Derai', 'Dharampasha', 'Dowarabazar', 'Jagannathpur', 'Jamalganj', 'Sullah', 'Sunamganj Sadar', 'Tahirpur'],
  'Sylhet':         ['Balaganj', 'Beanibazar', 'Bishwanath', 'Companiganj', 'Dakshin Surma', 'Fenchuganj', 'Golapganj', 'Gowainghat', 'Jaintiapur', 'Kanaighat', 'Osmani Nagar', 'Sylhet Sadar', 'Zakiganj'],

  // ============ RANGPUR DIVISION ============
  'Dinajpur':       ['Birampur', 'Biral', 'Bochaganj', 'Chirirbandar', 'Dinajpur Sadar', 'Ghoraghat', 'Hakimpur', 'Kaharole', 'Khansama', 'Nawabganj', 'Parbatipur', 'Phulbari'],
  'Gaibandha':      ['Fulchhari', 'Gaibandha Sadar', 'Gobindaganj', 'Palashbari', 'Sadullapur', 'Saghata', 'Sundarganj'],
  'Kurigram':       ['Bhurungamari', 'Char Rajibpur', 'Chilmari', 'Kurigram Sadar', 'Nageshwari', 'Phulbari', 'Rajarhat', 'Raomari', 'Ulipur'],
  'Lalmonirhat':    ['Aditmari', 'Hatibandha', 'Kaliganj', 'Lalmonirhat Sadar', 'Patgram'],
  'Nilphamari':     ['Dimla', 'Domar', 'Jaldhaka', 'Kishoreganj', 'Nilphamari Sadar', 'Saidpur'],
  'Panchagarh':     ['Atwari', 'Boda', 'Debiganj', 'Panchagarh Sadar', 'Tetulia'],
  'Rangpur':        ['Badarganj', 'Gangachara', 'Kaunia', 'Mithapukur', 'Pirgachha', 'Pirganj', 'Rangpur Sadar', 'Taraganj'],
  'Thakurgaon':     ['Baliadangi', 'Haripur', 'Pirganj', 'Ranisankail', 'Thakurgaon Sadar'],

  // ============ MYMENSINGH DIVISION ============
  'Jamalpur':       ['Baksiganj', 'Dewanganj', 'Islampur', 'Jamalpur Sadar', 'Madarganj', 'Melandaha', 'Sarishabari'],
  'Mymensingh':     ['Bhaluka', 'Dhobaura', 'Fulbaria', 'Gafargaon', 'Gauripur', 'Haluaghat', 'Ishwarganj', 'Mymensingh Sadar', 'Muktagachha', 'Nandail', 'Phulpur', 'Tarakanda', 'Trishal'],
  'Netrokona':      ['Atpara', 'Barhatta', 'Durgapur', 'Khaliajuri', 'Kalmakanda', 'Kendua', 'Madan', 'Mohanganj', 'Netrokona Sadar', 'Purbadhala'],
  'Sherpur':        ['Jhenaigati', 'Nakla', 'Nalitabari', 'Sherpur Sadar', 'Sreebardi']
};

// Flat list of all 64 district names (alphabetical)
export const BD_DISTRICTS = Object.keys(BD_LOCATIONS).sort();

// Helper: get thanas for a district
export const getThanas = (district) => BD_LOCATIONS[district] || [];

// Stats
export const BD_STATS = {
  divisions: 8,
  districts: BD_DISTRICTS.length,
  thanas: Object.values(BD_LOCATIONS).reduce((sum, t) => sum + t.length, 0)
};
