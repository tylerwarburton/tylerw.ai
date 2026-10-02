/** Remove unrelated LinkedIn recommendations and messaging UI before inference. */
export function cleanProfileText(text: string): string {
  let lines=text.replace(/\r\n?/g,'\n').split('\n');
  const tail=lines.findIndex(line=>/^(More profiles for you|People you may know|You might like|MessagingYou are on the messaging overlay|You are on the messaging overlay|Page inboxes|Compose message)\b/i.test(line.trim()));
  if(tail>=0) lines=lines.slice(0,tail);
  const out:string[]=[];
  let recommendations=false;
  for(const line of lines){
    const t=line.trim();
    if(/^People similar to\b/i.test(t)){recommendations=true;continue;}
    if(recommendations && /^(About|Highlights|Activity|Experience|Education|Skills(?:\s*\(\d+\))?)$/i.test(t)) recommendations=false;
    if(!recommendations) out.push(line);
  }
  return out.join('\n').replace(/\n{3,}/g,'\n\n').trim();
}
