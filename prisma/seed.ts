async function main() {
  console.log("Seed complete: no default data is created in this phase.");
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
