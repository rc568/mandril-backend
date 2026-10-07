with client_phone_numbers_clean as (
	select
		c.id,
		trim(regexp_replace(c.phone_number1, '[^0-9/]', '', 'g')) as ph1,
		c.phone_number2 as ph2
	from client c
),
split_phone_number as (
	select
		id,
		split_part(c.ph1, '/', 1) as ph1,
		nullif(split_part(c.ph1, '/', 2),'') as ph2
	from client_phone_numbers_clean c
),
format_phone_numbers as (
	select
		id,
		case
			when length(ph1) = 9 and starts_with(ph1, '9') then '+51' || ph1
			when
				not (starts_with(ph1, '9') and length(ph1) = 9)
				and not starts_with(ph1, '1')
				and not starts_with(ph1, '5')
				then '+1' || ph1
			else '+' || ph1
		end as ph1,
		case
			when length(ph2) = 9 and starts_with(ph2, '9') then '+51' || ph2
			when
				not (starts_with(ph2, '9') and length(ph2) = 9)
				and not starts_with(ph2, '1')
				and not starts_with(ph2, '5')
				then '+1' || ph2
			else '+' || ph2
		end as ph2
	from split_phone_number c
)
UPDATE client
SET phone_number1 = f.ph1,
    phone_number2 = f.ph2
FROM format_phone_numbers AS f
WHERE client.id = f.id; --> statement-breakpoint

ALTER TABLE "client" ALTER COLUMN "phone_number1" SET DATA TYPE varchar(16);--> statement-breakpoint
ALTER TABLE "client" ALTER COLUMN "phone_number2" SET DATA TYPE varchar(16);--> statement-breakpoint
ALTER TABLE "client" ADD CONSTRAINT "client_phone_number1_format" CHECK ("client"."phone_number1" IS NULL OR "client"."phone_number1" ~ '^\+[1-9][0-9]{1,14}$');--> statement-breakpoint
ALTER TABLE "client" ADD CONSTRAINT "client_phone_number2_format" CHECK ("client"."phone_number2" IS NULL OR "client"."phone_number2" ~ '^\+[1-9][0-9]{1,14}$');