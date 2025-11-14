const muslimMaleNames = [
  "Muhammad", "Ahmed", "Ali", "Hassan", "Hussain", "Omar", "Usman", "Bilal", "Hamza", "Yusuf",
  "Ibrahim", "Ismail", "Zain", "Zayn", "Asad", "Faisal", "Tariq", "Saad", "Salman", "Imran",
  "Adnan", "Fahad", "Khalid", "Rashid", "Nasir", "Amin", "Jawad", "Kamran", "Raza", "Rizwan",
  "Shahid", "Naveed", "Umer", "Umar", "Junaid", "Farhan", "Arslan", "Haroon", "Haris", "Owais",
  "Talha", "Abdullah", "Abdur Rahman", "Abdul Aziz", "Abdul Malik", "Mustafa", "Sami", "Waleed", "Zubair", "Yasir",
  "Anas", "Ayaan", "Ayub", "Azhar", "Danish", "Ehsan", "Fawad", "Furqan", "Haider", "Hamid",
  "Hanif", "Idris", "Ihsan", "Ikram", "Jalal", "Jameel", "Kashif", "Latif", "Majid", "Mansoor",
  "Mohsin", "Muazzam", "Mudassir", "Mujtaba", "Munir", "Nabil", "Nadeem", "Nadir", "Naeem", "Naseem",
  "Navid", "Niaz", "Noman", "Qasim", "Raheem", "Rahim", "Raees", "Rafiq", "Rehan", "Riaz",
  "Sabir", "Sadiq", "Saif", "Sajid", "Saleem", "Sameer", "Sarfraz", "Shahzad", "Shakeel", "Shams",
  "Sharif", "Shoaib", "Sohail", "Sulaiman", "Suleman", "Tahir", "Taimur", "Tanveer", "Tauqeer", "Waqar",
  "Waqas", "Yaseen", "Zaheer", "Zahid", "Zakir", "Zeeshan", "Abid", "Adeel", "Afzal", "Ahsan",
  "Aijaz", "Akbar", "Akram", "Amir", "Anwar", "Aqeel", "Arif", "Ashraf", "Asif", "Aslam",
  "Atif", "Atiq", "Awais", "Ayaz", "Azeem", "Aziz", "Babar", "Bashir", "Dawood", "Ejaz",
  "Farooq", "Fayyaz", "Ghulam", "Habib", "Hammad", "Hannan", "Haseeb", "Hashim", "Hidayat", "Hussam",
  "Iftikhar", "Ijaz", "Inam", "Intizar", "Iqbal", "Irfan", "Ishaq", "Javed", "Kamal", "Kareem",
  "Liaquat", "Luqman", "Mahmood", "Manzoor", "Masood", "Mazhar", "Mehboob", "Mehmood", "Mubarak", "Mubashir",
  "Mudassar", "Mufti", "Mujahid", "Mukhtar", "Mumtaz", "Muneeb", "Munib", "Murtaza", "Musharraf", "Musheer",
  "Muslim", "Mustapha", "Nabeel", "Nauman", "Nazir", "Noor", "Nouman", "Obaid", "Pervez", "Qadir",
  "Qamar", "Qasem", "Raashid", "Rafi", "Rahat", "Raihan", "Rameez", "Ramzan", "Rauf", "Rayyan"
];

const muslimFemaleNames = [
  "Fatima", "Aisha", "Maryam", "Zainab", "Khadija", "Hafsa", "Ruqayyah", "Umm Kulthum", "Safiya", "Sumaya",
  "Amina", "Asma", "Halima", "Sawda", "Maymuna", "Juwayriya", "Ramlah", "Zaynab", "Hawa", "Sara",
  "Hana", "Hiba", "Layla", "Noor", "Nura", "Sumayyah", "Yasmin", "Zara", "Aaliyah", "Abida",
  "Adila", "Afra", "Alima", "Amara", "Amira", "Anisa", "Areeba", "Arifa", "Asiya", "Ayesha",
  "Azra", "Basima", "Benazir", "Bushra", "Dania", "Dua", "Faiza", "Farida", "Fariha", "Ghazala",
  "Habiba", "Hadia", "Haleema", "Hamida", "Hanna", "Hasina", "Huda", "Iffat", "Iram", "Jamila",
  "Juwairiya", "Kalsoom", "Kanwal", "Kausar", "Kulsum", "Laiba", "Lubna", "Madiha", "Maheen", "Mahnoor",
  "Malaika", "Maleeha", "Manha", "Marwa", "Mehak", "Mehreen", "Mehnaz", "Muskan", "Nabila", "Nadia",
  "Nafeesa", "Nagina", "Naila", "Najma", "Naseem", "Nazia", "Nighat", "Nimra", "Noreen", "Nosheen",
  "Parveen", "Qurat", "Rabia", "Raeesa", "Rameen", "Ramsha", "Rania", "Rehana", "Rifat", "Rubina",
  "Ruksana", "Saba", "Sabiha", "Sabina", "Sadaf", "Sadia", "Safa", "Safia", "Sahar", "Saima",
  "Sajida", "Saliha", "Salma", "Samina", "Sana", "Saniya", "Shaista", "Shamim", "Shazia", "Shehnaz",
  "Shifa", "Sidra", "Sobia", "Sonia", "Sumaira", "Summaya", "Tahira", "Taiba", "Talha", "Tanzeela",
  "Tasneem", "Tayyaba", "Umama", "Umme", "Uzma", "Warda", "Yasmeen", "Zahida", "Zahra", "Zara",
  "Zeenat", "Zubaida", "Zuhra", "Aamna", "Abiha", "Adeela", "Afeefa", "Afshan", "Aiman", "Aiza",
  "Alisha", "Aliza", "Amna", "Anum", "Aqsa", "Arisha", "Arwa", "Asra", "Ayat", "Azka",
  "Baseera", "Bisma", "Duaa", "Eman", "Emaan", "Eshal", "Farah", "Fareeda", "Fizza", "Gulshan",
  "Hajra", "Haleema", "Haniya", "Hareem", "Humna", "Iqra", "Isha", "Javeria", "Kinza", "Laraib",
  "Mahira", "Maimuna", "Maira", "Maliha", "Marriam", "Mehwish", "Misbah", "Muneera", "Myra", "Nabiha",
  "Naima", "Nida", "Rabiya", "Raees", "Rafia", "Ramla", "Rayana", "Rida", "Rimsha", "Roshni"
];

const seoKeywords = [
  "Young Muslim marriage", "Muslim singles UK", "Muslim singles London", "Find Muslim match London",
  "Muslim dating halal", "Halal Muslim matchmaking", "Modern Muslim marriage", "Online Muslim matchmaking",
  "Muslim relationship London", "Muslim singles Manchester", "Muslim youth marriage UK", "Find Muslim partner UK",
  "Halal Muslim dating UK", "Halal Muslim dating London", "Single Muslim marriage", "Muslim soulmate London",
  "Muslim marriage app", "Online Muslim matchmaking UK", "Muslim connection site", "Muslim partner search UK",
  "Muslim dating app halal", "Find Muslim love UK", "Muslim love London", "Halal matchmaking platform",
  "Halal Muslim relationships", "Muslim shaadi app", "Muslim shaadi site UK", "Halal dating site London",
  "Single Muslim rishta", "Muslim wedding match", "Muslim engagement UK", "Muslim couple London",
  "Modern Nikkah UK", "Halal rishta platform", "Online Muslim spouse", "Muslim match London",
  "Muslim singles Birmingham", "Halal Muslim marriage London", "Muslim wedding service UK",
  "Muslim marriage for singles", "Find Muslim soulmate UK", "Muslim partner London", "Muslim rishta for singles",
  "Halal love marriage", "Halal match London", "Muslim shaadi UK", "Single Muslim matrimony",
  "Muslim love site UK", "Muslim matchmaker London", "Muslim youth rishta", "Find halal Muslim partner"
];


module.exports = {
  muslimMaleNames,
  muslimFemaleNames,
  seoKeywords
};