const NAMES = [
  "nice.pulls",
  "one.more.pack",
  "no.dupes.pls",
  "foil.chaser",
  "not.a.bot",
  "mint.condition",
  "pulls.or.riot",
  "gg.no.re",
  "i.believe.in.commons",
  "trust.the.pack",
  "ooh.shiny",
  "i.love",
  "top.deck",
  "ungraded.gem",
  "check.my.binder",
  "its.not.an.addiction",
  "help.im.broke",
  "just.looking",
  "plays.for.the.art",
  "do.not.shuffle",
  "bulk.is.beautiful",
  "definitely.my.real.email",
  "real.human.bean",
  "clickety.clack",
  "forgot.my.password.already",
  "why.is.this.required",
  "hold.my.coffee",
  "sleeve.first.ask.later",
];

export function randomEmailPlaceholder(): string {
  return `${NAMES[Math.floor(Math.random() * NAMES.length)]}@openrift.app`;
}
