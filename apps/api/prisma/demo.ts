import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import argon2 from 'argon2';

// Deliberately local-only. Never run against an environment with real employee data.
if (process.env.NODE_ENV === 'production' || process.env.ALLOW_DEMO_SEED !== 'yes') {
  throw new Error('Demo seed disabled. Set ALLOW_DEMO_SEED=yes in a throwaway local environment.');
}

const prisma = new PrismaClient();
const year = new Date().getUTCFullYear();
const passwordHash = await argon2.hash('DemoOnly!2026');
const people = [
  { email:'demo.admin@co2opt.com', name:'Alex Aurora', role:'ADMIN' },
  { email:'demo.manager@co2opt.com', name:'Sam Spark', role:'MANAGER' },
  { email:'demo.employee@co2opt.com', name:'Taylor Turbo', role:'EMPLOYEE' },
  { email:'demo.extra@co2opt.com', name:'Charlie Confetti', role:'EMPLOYEE' }
];
const users = [];
for (const person of people) {
  users.push(await prisma.user.upsert({
    where: { email: person.email },
    update: {name:person.name,role:person.role,passwordHash,active:true},
    create: {...person,passwordHash,active:true}
  }));
}
if (await prisma.recommendation.count() === 0) {
  await prisma.recommendation.createMany({data:[
    {type:'MOVIE',title:'The Grand Budapest Hotel',note:'Very colorful, very weird, very good!',authorId:users[0].id},
    {type:'SERIES',title:'Severance',note:'Office life, but make it mysterious.',authorId:users[1].id},
    {type:'BOOK',title:'Atomic Habits',note:'Tiny changes add up.',authorId:users[2].id},
    {type:'MUSIC',title:'Friday Focus Playlist',url:'https://open.spotify.com/',note:'Add your favorite Friday track!',authorId:users[3].id}
  ]});
}
if (await prisma.kudos.count() === 0) await prisma.kudos.createMany({data:[
  {fromId:users[0].id,toId:users[1].id,message:'You saved the day during the release 🚀'},
  {fromId:users[2].id,toId:users[3].id,message:'Thanks for making team calls hilarious 💚'}
]});
if (await prisma.poll.count() === 0) await prisma.poll.create({data:{
  question:'What should our next Friday activity be?',optionsJson:JSON.stringify(['Movie night','Online games','Team quiz','Music roulette']),closesAt:new Date(year+1,0,1),createdBy:users[0].id
}});
if (await prisma.wheelPreset.count() === 0) await prisma.wheelPreset.create({data:{
  name:'Friday Fun',optionsJson:JSON.stringify(['Movie','Games','Trivia','Memes','Music']),createdBy:users[1].id
}});
console.log('Demo accounts (local only): demo.admin@co2opt.com / DemoOnly!2026 (same password for all demo users)');
await prisma.$disconnect();