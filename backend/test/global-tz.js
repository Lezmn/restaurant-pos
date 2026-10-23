// ตั้งเวลาไทยใน process หลักของ Jest ก่อนแตก worker — worker สืบทอด env นี้ไป
// (ตั้งใน setupFiles อย่างเดียวไม่พอ: worker เปิดมาด้วย TZ ของเครื่องแล้ว บน CI ที่เป็น UTC เทสต์ขอบวันจะพัง)
module.exports = () => {
  process.env.TZ = 'Asia/Bangkok';
};
