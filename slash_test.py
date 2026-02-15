import discord
from discord.ext import commands

BOT_TOKEN = "MTQ0MjU1NjU2NzkwNjk0NzE4NA.GwTxe9.g8dSDn7IUnZdOHiZyz6OfivElYHKWSQ-CYWPWA"
GUILD_ID = 1365109875889279009  # your server ID

intents = discord.Intents.default()
bot = commands.Bot(command_prefix="!", intents=intents)

@bot.tree.command(name="hello", description="Sanity check slash command")
async def hello(interaction: discord.Interaction):
    await interaction.response.send_message("✅ Slash commands are working!", ephemeral=True)

@bot.event
async def on_ready():
    print("TREE:", list(bot.tree.walk_commands()))
    guild = discord.Object(id=GUILD_ID)
    await bot.tree.sync(guild=guild)
    print("✅ SYNCED")

bot.run(BOT_TOKEN)
