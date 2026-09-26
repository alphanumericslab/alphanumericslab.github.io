---
layout: page
title: Team
---
{% comment %}
  People are listed in _data/team.yml. Edit that file to add or update members.
{% endcomment %}

{% include team/director.html %}

## Members

{% include team/grid.html people=site.data.team.members %}

## Alumni

{% include team/grid.html people=site.data.team.alumni %}

## Shiraz University Alumni

{% include team/list.html people=site.data.team.shiraz_alumni %}
