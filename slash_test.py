import os
import discord
from discord.ext import commands
from dotenv import load_dotenv

load_dotenv()

BOT_TOKEN = os.getenv("DISCORD_BOT_TOKEN")
GUILD_ID = int(os.getenv("DISCORD_GUILD_ID", "0"))

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
