/**
 * Sample character bios for testing
 */
const sampleBios = [
  {
    name: "Elizabeth",
    type: "bio",
    relationships: {
      "Darcy": "Initially dislikes him due to his pride, but gradually develops a deep understanding and love",
      "Jane": "Beloved elder sister and closest confidante",
      "Wickham": "Initially charmed by him, later discovers his true nature"
    },
    character_arc: "Journey from prejudice to understanding and love",
    tags: ["pride", "prejudice", "wit", "independence"]
  },
  {
    name: "Darcy",
    type: "bio",
    relationships: {
      "Elizabeth": "Initially dismissive but grows to admire her wit and fine eyes, eventually falls deeply in love",
      "Bingley": "Close friend and confidant",
      "Wickham": "Former childhood companion turned bitter enemy due to Wickham's attempted seduction of his sister"
    },
    character_arc: "Learns to overcome his pride and class prejudices",
    tags: ["pride", "wealth", "honor", "loyalty"]
  },
  {
    name: "Jane",
    type: "bio",
    relationships: {
      "Elizabeth": "Dearest sister and friend",
      "Bingley": "Falls in love with him at first sight",
    },
    character_arc: "Finds happiness while maintaining her gentle nature",
    tags: ["kindness", "beauty", "gentleness"]
  },
  {
    name: "Wickham",
    type: "bio",
    relationships: {
      "Elizabeth": "Attempts to win her favor through deceit",
      "Darcy": "Harbors resentment over perceived wrongs",
      "Lydia": "Seduces and elopes with her"
    },
    character_arc: "Reveals his true character through his actions",
    tags: ["deceit", "charm", "selfishness"]
  }
];

/**
 * Sample chapters for testing
 */
const sampleChapters = [
  {
    chapter_id: "ch1",
    type: "chapter_text",
    text: `At the Meryton assembly, Bingley danced with Jane repeatedly, clearly enchanted by her beauty. 
    Elizabeth observed their interactions with joy. However, her own evening was less pleasant. She overheard 
    Darcy remark to Bingley, "She is tolerable, but not handsome enough to tempt me." Elizabeth laughed off 
    the slight, sharing the story with her friends, her eyes sparkling with amusement at his pride.

    Later in the evening, Jane and Bingley conversed quietly in a corner, while Elizabeth danced with others, 
    occasionally catching Darcy watching her with an unreadable expression.`
  },
  {
    chapter_id: "ch2",
    type: "chapter_text",
    text: `Elizabeth encountered Wickham in Meryton, where he charmed her with his easy manners and his tale 
    of mistreatment by Darcy. "He denied me the living that was promised," Wickham said earnestly, his eyes 
    fixed on Elizabeth's sympathetic face. She felt her dislike of Darcy increase with each detail of 
    Wickham's story.

    When Darcy appeared suddenly on horseback with Bingley, Elizabeth noticed the stark tension between him 
    and Wickham. Wickham quickly excused himself, while Darcy's face showed barely controlled anger.`
  },
  {
    chapter_id: "ch3",
    type: "chapter_text",
    text: `At the Netherfield ball, Elizabeth was mortified to find herself promised to dance with Darcy. 
    Their dance began in silence, but Elizabeth, determined to make him uncomfortable, mentioned her 
    acquaintance with Wickham. Darcy's face tensed, though he maintained his composure.

    "Do not give credit to all of Wickham's accusations," he said quietly, his eyes intense. Elizabeth 
    replied sharply, defending Wickham, though she noticed an unfamiliar flutter in her chest at Darcy's 
    proximity.

    Meanwhile, Jane and Bingley danced together, lost in their own world of mutual admiration and gentle 
    conversation.`
  },
  {
    chapter_id: "ch4",
    type: "chapter_text",
    text: `The news of Lydia's elopement with Wickham struck the family hard. Elizabeth, upon hearing of 
    Darcy's unexpected arrival, was shocked to find him offering his help. "I must find them," he said 
    with quiet intensity. "I know Wickham's habits and haunts." Elizabeth felt tears in her eyes at his 
    kindness, so at odds with her previous judgment of him.

    When Jane heard the news, she immediately thought of Bingley, wondering if this scandal would affect 
    their relationship. She confided her fears to Elizabeth, who hugged her sister tightly.`
  },
  {
    chapter_id: "ch5",
    type: "chapter_text",
    text: `In the early morning mist at Longbourn, Darcy and Elizabeth walked together in the garden. 
    "My feelings have not changed," he said softly, his eyes full of emotion. Elizabeth felt her heart 
    race as she replied, "Mine have. I was so wrong about you."

    Their quiet conversation was interrupted by Jane's appearance, her face glowing with happiness. 
    Bingley had proposed, and she had accepted. The sisters embraced joyfully, while Darcy watched 
    with a gentle smile.

    Later that day, news arrived that Wickham had been seen gambling in London, showing no remorse 
    for his actions with Lydia.`
  }
];

module.exports = {
  sampleBios,
  sampleChapters
};