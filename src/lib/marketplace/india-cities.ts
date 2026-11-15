/** Major Indian cities as "City, State" so creators and brands pick one consistent spelling. */
export const INDIA_CITIES = [
  "Mumbai, Maharashtra", "Pune, Maharashtra", "Nagpur, Maharashtra", "Nashik, Maharashtra", "Thane, Maharashtra", "Navi Mumbai, Maharashtra", "Aurangabad, Maharashtra", "Kolhapur, Maharashtra",
  "Delhi, Delhi", "New Delhi, Delhi", "Gurugram, Haryana", "Faridabad, Haryana", "Noida, Uttar Pradesh", "Ghaziabad, Uttar Pradesh", "Lucknow, Uttar Pradesh", "Kanpur, Uttar Pradesh", "Agra, Uttar Pradesh", "Varanasi, Uttar Pradesh", "Prayagraj, Uttar Pradesh", "Meerut, Uttar Pradesh",
  "Bengaluru, Karnataka", "Mysuru, Karnataka", "Mangaluru, Karnataka", "Hubballi, Karnataka",
  "Hyderabad, Telangana", "Warangal, Telangana", "Visakhapatnam, Andhra Pradesh", "Vijayawada, Andhra Pradesh", "Guntur, Andhra Pradesh", "Tirupati, Andhra Pradesh",
  "Chennai, Tamil Nadu", "Coimbatore, Tamil Nadu", "Madurai, Tamil Nadu", "Tiruchirappalli, Tamil Nadu", "Salem, Tamil Nadu",
  "Kochi, Kerala", "Thiruvananthapuram, Kerala", "Kozhikode, Kerala", "Thrissur, Kerala",
  "Kolkata, West Bengal", "Howrah, West Bengal", "Siliguri, West Bengal", "Durgapur, West Bengal",
  "Ahmedabad, Gujarat", "Surat, Gujarat", "Vadodara, Gujarat", "Rajkot, Gujarat", "Gandhinagar, Gujarat",
  "Jaipur, Rajasthan", "Jodhpur, Rajasthan", "Udaipur, Rajasthan", "Kota, Rajasthan", "Ajmer, Rajasthan",
  "Bhopal, Madhya Pradesh", "Indore, Madhya Pradesh", "Gwalior, Madhya Pradesh", "Jabalpur, Madhya Pradesh",
  "Chandigarh, Chandigarh", "Ludhiana, Punjab", "Amritsar, Punjab", "Jalandhar, Punjab", "Mohali, Punjab",
  "Patna, Bihar", "Gaya, Bihar", "Ranchi, Jharkhand", "Jamshedpur, Jharkhand", "Dhanbad, Jharkhand",
  "Bhubaneswar, Odisha", "Cuttack, Odisha", "Raipur, Chhattisgarh", "Bilaspur, Chhattisgarh",
  "Guwahati, Assam", "Shillong, Meghalaya", "Imphal, Manipur", "Agartala, Tripura", "Gangtok, Sikkim",
  "Dehradun, Uttarakhand", "Haridwar, Uttarakhand", "Shimla, Himachal Pradesh", "Srinagar, Jammu and Kashmir", "Jammu, Jammu and Kashmir",
  "Panaji, Goa", "Margao, Goa", "Puducherry, Puducherry",
] as const;

/** City part used for matching, so "Mumbai, Maharashtra" also finds profiles that only say "Mumbai". */
export function locationSearchTerm(value: string) {
  return value.split(",")[0].trim();
}
